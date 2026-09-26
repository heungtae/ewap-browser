import { describe, expect, it } from "vitest";
import { PersistentProfileReplayStore } from "../../../src/profile/persistent-profile-replay.js";

const digest1 = "a".repeat(43);
const digest2 = "b".repeat(43);

describe("persistent Profile replay", () => {
  it("retains the high-water mark after a new store is constructed", async () => {
    let saved: unknown;
    const storage = {
      get: async () =>
        saved === undefined ? {} : { profile_replay_v1: saved },
      set: async (value: Record<string, unknown>) => {
        saved = value.profile_replay_v1;
      },
    };
    const first = new PersistentProfileReplayStore(storage);
    await expect(
      first.accept("deployment", "profile", 2, digest2),
    ).resolves.toBe("ADVANCED");
    expect(JSON.stringify(saved)).not.toContain("deployment");
    expect(JSON.stringify(saved)).not.toContain('profile"');

    const restarted = new PersistentProfileReplayStore(storage);
    await expect(
      restarted.accept("deployment", "profile", 1, digest1),
    ).rejects.toThrow("PROFILE_UNAVAILABLE");
    await expect(
      restarted.accept("deployment", "profile", 2, digest1),
    ).rejects.toThrow("PROFILE_UNAVAILABLE");
    await expect(
      restarted.accept("deployment", "profile", 2, digest2),
    ).resolves.toBe("IDEMPOTENT_ACCEPTED");
  });

  it("rejects damaged state and failed writes", async () => {
    const damaged = new PersistentProfileReplayStore({
      get: async () => ({
        profile_replay_v1: {
          schema_version: 1,
          entries: [{ key: "raw-profile-id", version: 1, digest: digest1 }],
        },
      }),
      set: async () => {},
    });
    await expect(
      damaged.accept("deployment", "profile", 2, digest2),
    ).rejects.toThrow("PROFILE_UNAVAILABLE");

    const failedWrite = new PersistentProfileReplayStore({
      get: async () => ({}),
      set: async () => {
        throw new Error("storage unavailable");
      },
    });
    await expect(
      failedWrite.accept("deployment", "profile", 1, digest1),
    ).rejects.toThrow("PROFILE_UNAVAILABLE");
  });

  it("serializes concurrent version advances", async () => {
    let saved: unknown;
    const storage = {
      get: async () =>
        saved === undefined ? {} : { profile_replay_v1: saved },
      set: async (value: Record<string, unknown>) => {
        saved = value.profile_replay_v1;
      },
    };
    const store = new PersistentProfileReplayStore(storage);
    await expect(
      Promise.all([
        store.accept("deployment", "profile", 1, digest1),
        store.accept("deployment", "profile", 2, digest2),
      ]),
    ).resolves.toEqual(["ADVANCED", "ADVANCED"]);
    await expect(
      new PersistentProfileReplayStore(storage).accept(
        "deployment",
        "profile",
        1,
        digest1,
      ),
    ).rejects.toThrow("PROFILE_UNAVAILABLE");
  });
});
