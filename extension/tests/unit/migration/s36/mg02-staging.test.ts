import { expect, it, vi } from "vitest";
import { openDatabase } from "../../../../../packages/codebase-repository/src/database.js";
import { Mg02Staging } from "../../../../../apps/chrome-extension/src/migration/mg02-staging.js";
import { memoryMirror, policySource } from "./mg02-support.js";
async function fixture() {
  const factory = new (await import("fake-indexeddb")).IDBFactory();
  const open = () => openDatabase(factory, "2".repeat(64));
  const db = await open();
  let frozen = true;
  const data = {
    ...policySource(),
    provider_settings: "PRIVATE_PROVIDER_CANARY",
  };
  const source = {
    async assertFrozen(epoch: number) {
      if (epoch !== 1 || !frozen) throw new Error("FENCE_REVOKED");
    },
    async get(keys: string[]) {
      expect(keys).toEqual([
        "contextpilot_permissions",
        "wb_permissions",
        "agent_preferences",
      ]);
      return structuredClone(data);
    },
  };
  return {
    db,
    open,
    source,
    data,
    staging: new Mg02Staging(db, source),
    backend: memoryMirror(),
    profile: "2".repeat(64),
    unfreeze() {
      frozen = false;
    },
  };
}
it("binds revision/digest/profile/epoch on both sides, excludes raw sources and resumes after reopen", async () => {
  const f = await fixture();
  const original = structuredClone(f.data);
  try {
    const hash = await f.staging.sourceDigest(1);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    const checkpoint = await f.staging.stage("policy", 1, hash);
    const ack = await f.staging.mirror("policy", 1, f.profile, f.backend.port);
    expect(ack).toMatchObject({
      epoch: 1,
      policyRevision: 1,
      profileGuard: f.profile,
    });
    expect(
      await f.staging.validateMirror("policy", 1, f.profile, f.backend.port),
    ).toBe(true);
    expect(JSON.stringify([...f.backend.values.values()])).not.toMatch(
      /PRIVATE_PROVIDER_CANARY|snapshot/,
    );
    f.db.close();
    const db = await f.open();
    try {
      const reopened = new Mg02Staging(db, f.source);
      expect(await reopened.stage("policy", 1, hash)).toEqual(checkpoint);
      expect(
        await reopened.validateMirror("policy", 1, f.profile, f.backend.port),
      ).toBe(true);
    } finally {
      db.close();
    }
    expect(f.data).toEqual(original);
  } finally {
    f.db.close();
  }
});
it("a lost backend response leaves extension acknowledgment missing and retries idempotently", async () => {
  const f = await fixture();
  try {
    await f.staging.stage("lost", 1, await f.staging.sourceDigest(1));
    const disconnected = {
      ...f.backend.port,
      async put(value: Parameters<typeof f.backend.port.put>[0]) {
        await f.backend.port.put(value);
        throw new Error("CONTROLLED_DISCONNECT");
      },
    };
    await expect(
      f.staging.mirror("lost", 1, f.profile, disconnected),
    ).rejects.toThrow("CONTROLLED_DISCONNECT");
    expect(f.backend.values.size).toBe(1);
    expect(
      await f.staging.validateMirror("lost", 1, f.profile, f.backend.port),
    ).toBe(false);
    await f.staging.mirror("lost", 1, f.profile, f.backend.port);
    expect(
      await f.staging.validateMirror("lost", 1, f.profile, f.backend.port),
    ).toBe(true);
  } finally {
    f.db.close();
  }
});
it("mismatched profile/manifest acknowledgments and revoked epochs never become local authority", async () => {
  const f = await fixture();
  try {
    await f.staging.stage("wrong", 1, await f.staging.sourceDigest(1));
    await expect(
      f.staging.mirror("wrong", 1, "b".repeat(64), f.backend.port),
    ).rejects.toThrow("MG02_PROFILE");
    expect(f.backend.values.size).toBe(0);
    const bad = {
      ...f.backend.port,
      async put(value: Parameters<typeof f.backend.port.put>[0]) {
        return {
          ...(await f.backend.port.put(value)),
          profileGuard: "b".repeat(64),
        };
      },
    };
    await expect(f.staging.mirror("wrong", 1, f.profile, bad)).rejects.toThrow(
      "MG02_MIRROR_MISMATCH",
    );
    expect(
      await f.staging.validateMirror("wrong", 1, f.profile, f.backend.port),
    ).toBe(false);
    f.unfreeze();
    await expect(
      f.staging.mirror("wrong", 1, f.profile, f.backend.port),
    ).rejects.toThrow("FENCE_REVOKED");
  } finally {
    f.db.close();
  }
});
it("a quota fault after backend commit leaves no false extension ACK and can be resumed", async () => {
  const f = await fixture();
  try {
    await f.staging.stage("quota", 1, await f.staging.sourceDigest(1));
    const { IDBObjectStore } = await import("fake-indexeddb");
    const put = vi
      .spyOn(IDBObjectStore.prototype, "put")
      .mockImplementationOnce(() => {
        throw new DOMException("ACK quota", "QuotaExceededError");
      });
    try {
      await expect(
        f.staging.mirror("quota", 1, f.profile, f.backend.port),
      ).rejects.toThrow("ACK quota");
    } finally {
      put.mockRestore();
    }
    expect(f.backend.values.size).toBe(1);
    expect(
      await f.staging.validateMirror("quota", 1, f.profile, f.backend.port),
    ).toBe(false);
    await f.staging.mirror("quota", 1, f.profile, f.backend.port);
    expect(
      await f.staging.validateMirror("quota", 1, f.profile, f.backend.port),
    ).toBe(true);
  } finally {
    f.db.close();
  }
});

it("rechecks source after backend observation rather than accepting an ACK for changed rules", async () => {
  const f = await fixture();
  try {
    await f.staging.stage("observe", 1, await f.staging.sourceDigest(1));
    await f.staging.mirror("observe", 1, f.profile, f.backend.port);
    const stale = {
      ...f.backend.port,
      async read(...args: Parameters<typeof f.backend.port.read>) {
        const ack = await f.backend.port.read(...args);
        f.data.contextpilot_permissions[0]!.action = "deny";
        return ack;
      },
    };
    await expect(
      f.staging.validateMirror("observe", 1, f.profile, stale),
    ).rejects.toThrow("MG02_STAGE_STALE");
  } finally {
    f.db.close();
  }
});
