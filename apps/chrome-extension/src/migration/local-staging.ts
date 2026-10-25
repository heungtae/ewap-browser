import {
  canonicalJson,
  digestCanonical,
} from "../../../../extension/src/security/canonical.js";
import {
  request,
  completed,
} from "../../../../packages/codebase-repository/src/database.js";
import type { Checkpoint } from "../../../agent-server/src/migration/coordinator.js";
export interface LocalConversion {
  records: unknown[];
  quarantine: unknown[];
  sourceCount: number;
}
export interface StagingConfig<S, C> {
  unit: "MG02" | "MG03" | "MG04" | "MG05";
  schema: string;
  sourceKeys: readonly string[];
  convert(snapshot: S): C;
}
export interface FrozenSource {
  get(keys: string[]): Promise<Record<string, unknown>>;
  assertFrozen(epoch: number): Promise<void>;
}
export interface StagedSnapshot<S, C> {
  key: string;
  schema: string;
  migrationId: string;
  epoch: number;
  snapshot: S;
  conversion: C;
  checkpoint: Checkpoint;
}
export class LocalStaging<S, C extends LocalConversion> {
  constructor(
    private readonly db: IDBDatabase,
    private readonly source: FrozenSource,
    private readonly config: StagingConfig<S, C>,
  ) {}
  private key(id: string) {
    return JSON.stringify([this.config.unit, id]);
  }
  private async snapshot(epoch: number): Promise<S> {
    await this.source.assertFrozen(epoch);
    const raw = await this.source.get([...this.config.sourceKeys]);
    const snapshot = structuredClone(
      Object.fromEntries(
        this.config.sourceKeys
          .filter((key) => Object.hasOwn(raw, key))
          .map((key) => [key, raw[key]]),
      ),
    );
    if (
      new TextEncoder().encode(canonicalJson(snapshot)).length >
      4 * 1024 * 1024
    )
      throw new Error(`${this.config.unit}_SNAPSHOT_LIMIT`);
    return snapshot as S;
  }
  async sourceDigest(epoch: number) {
    return digestCanonical(await this.snapshot(epoch));
  }
  async read(id: string): Promise<StagedSnapshot<S, C> | undefined> {
    const tx = this.db.transaction("migrationJournal", "readonly");
    const done = completed(tx);
    const value = (await request(
      tx.objectStore("migrationJournal").get(this.key(id)),
    )) as StagedSnapshot<S, C> | undefined;
    await done;
    return value;
  }
  async stage(
    id: string,
    epoch: number,
    expectedSourceDigest: string,
  ): Promise<Checkpoint> {
    if (
      !/^[A-Za-z0-9_-]{1,128}$/.test(id) ||
      !Number.isSafeInteger(epoch) ||
      epoch < 1
    )
      throw new Error(`${this.config.unit}_IDENTITY`);
    const snapshot = await this.snapshot(epoch);
    const sourceDigest = digestCanonical(snapshot);
    if (sourceDigest !== expectedSourceDigest)
      throw new Error("SOURCE_CHANGED");
    const conversion = this.config.convert(snapshot);
    const checkpoint = {
      sourceDigest,
      targetDigest: digestCanonical(conversion),
      sourceCount: conversion.sourceCount,
      copied: conversion.records.length,
      quarantined: conversion.quarantine.length,
    };
    if ((await this.sourceDigest(epoch)) !== sourceDigest)
      throw new Error("SOURCE_CHANGED");
    await this.source.assertFrozen(epoch);
    const tx = this.db.transaction("migrationJournal", "readwrite");
    const done = completed(tx);
    try {
      const store = tx.objectStore("migrationJournal");
      const current = (await request(store.get(this.key(id)))) as
        | StagedSnapshot<S, C>
        | undefined;
      if (current) {
        if (
          current.epoch !== epoch ||
          !this.matches(current, checkpoint, id, epoch)
        )
          throw new Error(`${this.config.unit}_CONFLICT`);
      } else
        store.add({
          key: this.key(id),
          schema: this.config.schema,
          migrationId: id,
          epoch,
          snapshot,
          conversion,
          checkpoint,
        } satisfies StagedSnapshot<S, C>);
      await done;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* Already completed/aborted. */
      }
      await done.catch(() => undefined);
      throw error;
    }
    const saved = await this.read(id);
    if (!saved || !this.matches(saved, checkpoint, id, epoch))
      throw new Error(`${this.config.unit}_READBACK`);
    await this.source.assertFrozen(epoch);
    return checkpoint;
  }
  private matches(
    saved: StagedSnapshot<S, C>,
    expected: Checkpoint,
    id: string,
    epoch: number,
  ) {
    return (
      saved.schema === this.config.schema &&
      saved.key === this.key(id) &&
      saved.migrationId === id &&
      saved.epoch === epoch &&
      canonicalJson(saved.checkpoint) === canonicalJson(expected) &&
      digestCanonical(saved.snapshot) === expected.sourceDigest &&
      digestCanonical(saved.conversion) === expected.targetDigest &&
      digestCanonical(this.config.convert(saved.snapshot)) ===
        expected.targetDigest
    );
  }
  async validate(id: string, epoch: number, expected: Checkpoint) {
    await this.source.assertFrozen(epoch);
    const saved = await this.read(id);
    return (
      !!saved &&
      saved.epoch === epoch &&
      this.matches(saved, expected, id, epoch) &&
      (await this.sourceDigest(epoch)) === expected.sourceDigest
    );
  }
}
