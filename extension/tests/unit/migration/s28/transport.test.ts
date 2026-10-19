import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  FrameDecoder,
  encodeFrame,
} from "../../../../../apps/agent-server/src/native/framing.js";
import {
  Handshake,
  proof,
  type Pairing,
} from "../../../../../apps/agent-server/src/ipc/auth.js";
import {
  Session,
  digest,
} from "../../../../../apps/agent-server/src/ipc/session.js";
import { EventReplay } from "../../../../../apps/agent-server/src/ipc/replay.js";
import { ChunkTransfer } from "../../../../../apps/agent-server/src/ipc/transfer.js";
const pairing: Pairing = {
  installationId: "install",
  profileId: "profile",
  extensionIds: ["a".repeat(32)],
  secret: "f".repeat(64),
};
function hello(h: Handshake) {
  return {
    kind: "hello",
    major: 1,
    minor: 0,
    installationId: pairing.installationId,
    profileId: pairing.profileId,
    extensionId: pairing.extensionIds[0]!,
    nonce: h.nonce,
    proof: proof(pairing, h.nonce, pairing.extensionIds[0]!),
  };
}
describe("S28 native framing", () => {
  it("decodes fragmented headers, UTF8 and coalesced frames", () => {
    const decoder = new FrameDecoder();
    const bytes = Buffer.concat([
      encodeFrame({ text: "한글" }),
      encodeFrame({ ok: true }),
    ]);
    const values = [];
    for (const byte of bytes) values.push(...decoder.push(Buffer.from([byte])));
    expect(values).toEqual([{ text: "한글" }, { ok: true }]);
    decoder.end();
  });
  it.each([0, 262145, 0xffffffff])(
    "rejects length %d before body buffering",
    (length) => {
      const head = Buffer.alloc(4);
      head.writeUInt32LE(length);
      const d = new FrameDecoder();
      expect(() => d.push(head)).toThrow("FRAME_SIZE");
      expect(() => d.push(Buffer.from([1]))).toThrow("FRAME_CLOSED");
    },
  );
  it("rejects truncated and invalid UTF8 frames", () => {
    const d = new FrameDecoder();
    d.push(encodeFrame({ a: 1 }).subarray(0, 6));
    expect(() => d.end()).toThrow();
    expect(() =>
      new FrameDecoder().push(Buffer.from([1, 0, 0, 0, 255])),
    ).toThrow();
  });
});
describe("S28 authentication and replay", () => {
  it("accepts one fresh challenge and refuses replay", () => {
    const h = new Handshake(pairing, 5000);
    const input = hello(h);
    expect(h.accept(input, 1).profileId).toBe("profile");
    expect(() => h.accept(input, 2)).toThrow();
  });
  it.each([
    { major: 2 },
    { profileId: "other" },
    { extensionId: "b".repeat(32) },
    { proof: "0".repeat(64) },
    { extra: true },
  ])("rejects unauthenticated context %j", (patch) => {
    const h = new Handshake(pairing, 5000);
    expect(() => h.accept({ ...hello(h), ...patch }, 1)).toThrow();
  });
  it("expires unused challenge", () => {
    const h = new Handshake(pairing, 5);
    expect(() => h.accept(hello(h), 6)).toThrow();
  });
  it("binds envelope, digest, deadline and message IDs", () => {
    const s = new Session(pairing, 1);
    const payload = { kind: "browser.connected", generation: 1 };
    const input = {
      major: 1,
      minor: 0,
      messageId: "m1",
      connectionId: s.connectionId,
      connectionEpoch: 1,
      installationId: "install",
      profileId: "profile",
      sender: "extension",
      sentAt: 1,
      deadline: 100,
      payloadDigest: digest(payload),
      payload,
    };
    expect(() => s.accept({ ...input, profileId: "other" }, 2)).toThrow();
    expect(() =>
      s.accept({ ...input, payloadDigest: "0".repeat(64) }, 2),
    ).toThrow();
    s.accept(input, 2);
    expect(s.browserAvailable()).toBe(true);
    expect(() => s.accept(input, 3)).toThrow();
    s.disconnect();
    expect(s.browserAvailable()).toBe(false);
    expect(() => s.accept({ ...input, messageId: "m2" }, 200)).toThrow();
  });
  it("provides bounded replay or explicit snapshot cursor", () => {
    const r = new EventReplay(2);
    r.append("one");
    r.append("two");
    r.append("three");
    expect(r.resume(0)).toMatchObject({
      resync: true,
      cursor: 3,
      events: [],
      snapshot: { revision: 3 },
    });
    expect(r.resume(1).events.map((e) => e.sequence)).toEqual([2, 3]);
    expect(r.resume(3).events).toEqual([]);
    expect(() => r.resume(4)).toThrow();
  });
});
describe("S28 chunk integrity", () => {
  const data = Buffer.from("ab");
  const spec = {
    id: "transfer",
    count: 2,
    bytes: 2,
    deadline: 100,
    digest: createHash("sha256").update(data).digest("hex"),
  };
  it("trusts only completed, acknowledged digest-checked payload", () => {
    const t = new ChunkTransfer(spec, 0);
    t.receive(0, data.subarray(0, 1), 1);
    t.ack(0, 2);
    t.receive(1, data.subarray(1), 3);
    t.ack(1, 4);
    expect(t.complete(5)).toEqual(data);
    expect(() => t.complete(6)).toThrow();
  });
  it.each(["reorder", "duplicate", "expiry", "digest", "cancel", "incomplete"])(
    "fails closed on %s",
    (mode) => {
      const t = new ChunkTransfer(
        { ...spec, digest: mode === "digest" ? "0".repeat(64) : spec.digest },
        0,
      );
      if (mode === "reorder") {
        expect(() => t.receive(1, data, 1)).toThrow();
        return;
      }
      if (mode === "expiry") {
        expect(() => t.receive(0, data, 100)).toThrow();
        return;
      }
      if (mode === "cancel") {
        t.cancel();
        expect(() => t.receive(0, data, 1)).toThrow();
        return;
      }
      t.receive(0, data.subarray(0, 1), 1);
      if (mode === "duplicate") {
        expect(() => t.receive(0, data.subarray(0, 1), 2)).toThrow();
        return;
      }
      if (mode === "incomplete") {
        expect(() => t.complete(2)).toThrow();
        return;
      }
      t.ack(0, 2);
      t.receive(1, data.subarray(1), 3);
      t.ack(1, 4);
      expect(() => t.complete(5)).toThrow();
    },
  );
  it("caps four unacknowledged chunks", () => {
    const t = new ChunkTransfer({ ...spec, count: 5, bytes: 5 }, 0);
    for (let i = 0; i < 4; i++) t.receive(i, Buffer.from("a"), i);
    expect(() => t.receive(4, Buffer.from("a"), 5)).toThrow();
  });
});
