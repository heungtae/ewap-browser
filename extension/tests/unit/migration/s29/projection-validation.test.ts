import { expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  validateProjection,
  projectionHash,
} from "../../../../../apps/agent-server/src/codebase/projection-validation.js";
import { CodebaseInbox } from "../../../../../apps/chrome-extension/src/bridge/codebase-inbox.js";
import { wireDigest } from "../../../../../apps/chrome-extension/src/bridge/native-auth.js";
import { projectionFixture } from "./projection-fixture.js";
it("rejects digest-preserving scope and evidence substitutions and mismatched query results", async () => {
  const f = await projectionFixture();
  try {
    const request = f.request({
      kind: "search",
      name: "Save",
      limit: 10,
      after: null,
    });
    const packet = await f.registry.project(request);
    const validate = (value: typeof packet) => {
      const { digest: _digest, ...body } = value;
      return validateProjection(
        Buffer.from(JSON.stringify({ ...body, digest: projectionHash(body) })),
        request,
        Date.now(),
      );
    };
    expect(validate(packet)).toEqual(packet);
    expect(() =>
      validate({
        ...packet,
        scope: { ...packet.scope, documentId: "foreign_document" },
      }),
    ).toThrow("PROJECTION_INTEGRITY");
    if (packet.payload.kind !== "search") throw Error("SEARCH");
    const searchPayload = packet.payload;
    expect(() =>
      validate({ ...packet, payload: { ...searchPayload, evidence: [] } }),
    ).toThrow("PROJECTION_INTEGRITY");
    expect(() =>
      validate({ ...packet, operationDigest: "0".repeat(64) }),
    ).toThrow("PROJECTION_INTEGRITY");
    const queryRequest = f.request({
      kind: "query",
      id: f.data.id,
      digest: f.data.digest,
      query: { op: "count", fields: [], filters: [], limit: 1 },
    });
    const query = await f.registry.project(queryRequest);
    if (query.payload.kind !== "query") throw Error("QUERY");
    const wrong = {
      ...query,
      payload: {
        ...query.payload,
        result: { ...query.payload.result, value: 999 },
      },
    };
    const { digest: _digest, ...body } = wrong;
    expect(() =>
      validateProjection(
        Buffer.from(JSON.stringify({ ...body, digest: projectionHash(body) })),
        queryRequest,
        Date.now(),
      ),
    ).toThrow("PROJECTION_INTEGRITY");
    expect(() =>
      validateProjection(
        Buffer.from(JSON.stringify(packet)),
        { ...request, maxBytes: 1 },
        Date.now(),
      ),
    ).toThrow("PROJECTION_LIMIT");
  } finally {
    f.close();
  }
});
it("rejects reverse frame tampering, wrong paired identity and message replay before invoking a read", async () => {
  const f = await projectionFixture();
  try {
    const payload = f.request({
      kind: "search",
      name: "Save",
      limit: 10,
      after: null,
    });
    const identity = { connectionId: payload.connectionId, connectionEpoch: 1 };
    const frame = {
      kind: "codebase.agent",
      major: 1,
      minor: 0,
      messageId: randomUUID(),
      ...identity,
      installationId: f.pairing.installationId,
      profileId: f.pairing.profileId,
      sender: "agent",
      sentAt: Date.now(),
      deadline: payload.deadline,
      payloadDigest: await wireDigest(payload),
      payload,
    };
    for (const patch of [
      { profileId: randomUUID() },
      { connectionEpoch: 2 },
      { payloadDigest: "0".repeat(64) },
      { deadline: Date.now() - 1 },
    ]) {
      const receive = vi.fn(),
        fail = vi.fn();
      const inbox = new CodebaseInbox(f.pairing, receive, fail);
      inbox.accept({ ...frame, ...patch }, identity);
      await vi.waitFor(() => expect(fail).toHaveBeenCalledOnce());
      expect(receive).not.toHaveBeenCalled();
      inbox.close();
    }
    const receive = vi.fn(),
      fail = vi.fn();
    const inbox = new CodebaseInbox(f.pairing, receive, fail);
    inbox.accept(frame, identity);
    await vi.waitFor(() => expect(receive).toHaveBeenCalledOnce());
    inbox.accept(frame, identity);
    await vi.waitFor(() => expect(fail).toHaveBeenCalledOnce());
    expect(receive).toHaveBeenCalledOnce();
    inbox.close();
  } finally {
    f.close();
  }
});
