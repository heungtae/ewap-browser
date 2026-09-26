import { fail } from "../security/validation.js";
import { ProfileReplayStore } from "./profile-replay.js";

export type ProfileReplayStorage = {
  get(key: string): Promise<Record<string, unknown>>;
  set(value: Record<string, unknown>): Promise<void>;
};

/** Persist only hashed Profile identity, version and definition digest. */
export class PersistentProfileReplayStore {
  private store = new ProfileReplayStore();
  private loading?: Promise<void>;
  private pending: Promise<void> = Promise.resolve();

  public constructor(private readonly storage: ProfileReplayStorage) {}

  private load(): Promise<void> {
    this.loading ??= this.storage
      .get("profile_replay_v1")
      .then((saved) => {
        if (saved.profile_replay_v1 !== undefined)
          this.store.restore(saved.profile_replay_v1);
      })
      .catch(() => fail("PROFILE_UNAVAILABLE"));
    return this.loading;
  }

  public accept(
    deploymentId: string,
    profileId: string,
    version: number,
    digest: string,
  ): Promise<"ADVANCED" | "IDEMPOTENT_ACCEPTED"> {
    const operation = this.pending.then(async () => {
      await this.load();
      const next = new ProfileReplayStore();
      next.restore(this.store.snapshot());
      const result = next.accept(deploymentId, profileId, version, digest);
      if (result === "ADVANCED") {
        try {
          await this.storage.set({ profile_replay_v1: next.snapshot() });
        } catch {
          return fail("PROFILE_UNAVAILABLE");
        }
        this.store = next;
      }
      return result;
    });
    this.pending = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }
}
