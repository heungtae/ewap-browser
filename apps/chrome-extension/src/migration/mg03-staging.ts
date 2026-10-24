import {
  canonicalJson,
  digestCanonical,
} from "../../../../extension/src/security/canonical.js";
import {
  request,
  completed,
} from "../../../../packages/codebase-repository/src/database.js";
import type { Checkpoint } from "../../../agent-server/src/migration/coordinator.js";
import { convertMg03 } from "./mg03-convert.js";
import { sourceKeys, type Snapshot, type Conversion } from "./mg03-types.js";
export interface Mg03Source {
  get(keys: string[]): Promise<Record<string, unknown>>;
  assertFrozen(epoch: number): Promise<void>;
}
export interface StagedMg03 {
  key: string;
  schema: "wca.mg03-stage/v1";
  migrationId: string;
  epoch: number;
  snapshot: Snapshot;
  conversion: Conversion;
  checkpoint: Checkpoint;
}
export class Mg03Staging {
  constructor(
    private readonly db: IDBDatabase,
    private readonly source: Mg03Source,
  ) {}
  private key(id: string) {
    return JSON.stringify(["MG03", id]);
  }
  private async snapshot(epoch: number): Promise<Snapshot> {
    await this.source.assertFrozen(epoch);
    const raw = await this.source.get([...sourceKeys]);
    const snapshot = structuredClone(
      Object.fromEntries(
        sourceKeys
          .filter((key) => Object.hasOwn(raw, key))
          .map((key) => [key, raw[key]]),
      ),
    );
    if (
      new TextEncoder().encode(canonicalJson(snapshot)).length >
      4 * 1024 * 1024
    )
      throw new Error("MG03_SNAPSHOT_LIMIT");
    return snapshot;
  }
  async sourceDigest(epoch: number) {
    return digestCanonical(await this.snapshot(epoch));
  }
  async read(id: string): Promise<StagedMg03 | undefined> {
    const tx = this.db.transaction("migrationJournal", "readonly");
    const done = completed(tx);
    const value = (await request(
      tx.objectStore("migrationJournal").get(this.key(id)),
    )) as StagedMg03 | undefined;
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
      throw new Error("MG03_IDENTITY");
    const snapshot = await this.snapshot(epoch);
    const sourceDigest = digestCanonical(snapshot);
    if (sourceDigest !== expectedSourceDigest)
      throw new Error("SOURCE_CHANGED");
    const conversion = convertMg03(snapshot);
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
        | StagedMg03
        | undefined;
      if (current) {
        if (current.epoch !== epoch || !this.matches(current, checkpoint))
          throw new Error("MG03_CONFLICT");
      } else
        store.add({
          key: this.key(id),
          schema: "wca.mg03-stage/v1",
          migrationId: id,
          epoch,
          snapshot,
          conversion,
          checkpoint,
        } satisfies StagedMg03);
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
    if (!saved || !this.matches(saved, checkpoint))
      throw new Error("MG03_READBACK");
    await this.source.assertFrozen(epoch);
    return checkpoint;
  }
  private matches(saved: StagedMg03, expected: Checkpoint) {
    return (
      saved.schema === "wca.mg03-stage/v1" &&
      canonicalJson(saved.checkpoint) === canonicalJson(expected) &&
      digestCanonical(saved.snapshot) === expected.sourceDigest &&
      digestCanonical(saved.conversion) === expected.targetDigest &&
      digestCanonical(convertMg03(saved.snapshot)) === expected.targetDigest
    );
  }
  async validate(id: string, epoch: number, expected: Checkpoint) {
    await this.source.assertFrozen(epoch);
    const saved = await this.read(id);
    return (
      !!saved &&
      saved.epoch === epoch &&
      this.matches(saved, expected) &&
      (await this.sourceDigest(epoch)) === expected.sourceDigest
    );
  }
}
