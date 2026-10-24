import { migrationDigest } from "./migration-digest.js";
import { canonicalJson } from "../../../../extension/src/security/canonical.js";
import {
  request,
  completed,
} from "../../../../packages/codebase-repository/src/database.js";
import type { Checkpoint } from "../../../agent-server/src/migration/coordinator.js";
import type { FrozenSource } from "./local-staging.js";
import {
  convertMg06,
  diagnosticsTtl,
  type DiagnosticsConversion,
  type DiagnosticsSnapshot,
} from "./mg06-convert.js";
import { diagnosticsRow } from "./mg06-persisted.js";
import { diagnosticsSource } from "./mg06-source.js";
export interface StagedDiagnostics {
  key: string;
  schema: "wca.mg06-stage/v1";
  migrationId: string;
  epoch: number;
  createdAt: number;
  expiresAt: number;
  conversion: DiagnosticsConversion;
  checkpoint: Checkpoint;
}
export type DiagnosticsRow = StagedDiagnostics | { key: string; expired: true };
type Row = DiagnosticsRow;
// Raw diagnostics remain only with their original retention owner. This store
// persists derived metadata and integrity digests, never a raw source snapshot.
export class Mg06Staging {
  constructor(
    private readonly db: IDBDatabase,
    private readonly source: FrozenSource,
    private readonly now = Date.now,
  ) {}
  private key(id: string) {
    return JSON.stringify(["MG06", id]);
  }
  async sourceDigest(epoch: number) {
    return (await diagnosticsSource(this.source, epoch)).digest;
  }
  private async row(id: string): Promise<Row | undefined> {
    const tx = this.db.transaction("migrationJournal", "readwrite");
    const done = completed(tx);
    const store = tx.objectStore("migrationJournal");
    let row = (await request(store.get(this.key(id)))) as Row | undefined;
    if (row) {
      try {
        row = diagnosticsRow(row);
      } catch (error) {
        await done;
        throw error;
      }
    }
    if (row && !("expired" in row) && row.expiresAt <= this.now()) {
      row = { key: this.key(id), expired: true };
      store.put(row);
    }
    await done;
    return row;
  }
  async read(id: string): Promise<StagedDiagnostics | undefined> {
    const row = await this.row(id);
    if (!row || "expired" in row) return undefined;
    if (row.expiresAt <= this.now()) return this.read(id);
    return row;
  }
  async stage(
    id: string,
    epoch: number,
    expectedDigest: string,
  ): Promise<Checkpoint> {
    if (
      !/^[A-Za-z0-9_-]{1,128}$/.test(id) ||
      !Number.isSafeInteger(epoch) ||
      epoch < 1
    )
      throw new Error("MG06_IDENTITY");
    const { snapshot, digest } = await diagnosticsSource(this.source, epoch);
    if (digest !== expectedDigest) throw new Error("SOURCE_CHANGED");
    const prior = await this.row(id);
    if (prior && "expired" in prior) throw new Error("MG06_RETENTION_EXPIRED");
    if (prior) {
      if (!this.matches(prior, snapshot, id, epoch))
        throw new Error("MG06_CONFLICT");
      await this.source.assertFrozen(epoch);
      if ((await this.sourceDigest(epoch)) !== digest)
        throw new Error("SOURCE_CHANGED");
      if (!this.matches(prior, snapshot, id, epoch))
        throw new Error("MG06_RETENTION_EXPIRED");
      return prior.checkpoint;
    }
    const createdAt = this.now();
    const conversion = convertMg06(snapshot, createdAt);
    const checkpoint = {
      sourceDigest: digest,
      targetDigest: migrationDigest(conversion),
      sourceCount: conversion.sourceCount,
      copied: conversion.records.length,
      quarantined: conversion.quarantine.length,
    };
    const next: StagedDiagnostics = {
      key: this.key(id),
      schema: "wca.mg06-stage/v1",
      migrationId: id,
      epoch,
      createdAt,
      expiresAt: Math.min(
        createdAt + diagnosticsTtl,
        ...conversion.records.map((row) => row.expiresAt),
      ),
      conversion,
      checkpoint,
    };
    if ((await this.sourceDigest(epoch)) !== digest)
      throw new Error("SOURCE_CHANGED");
    await this.source.assertFrozen(epoch);
    const tx = this.db.transaction("migrationJournal", "readwrite");
    const done = completed(tx);
    try {
      const store = tx.objectStore("migrationJournal");
      const existing = (await request(store.get(this.key(id)))) as
        | Row
        | undefined;
      if (existing) {
        if (
          "expired" in existing ||
          !this.matches(existing, snapshot, id, epoch)
        )
          throw new Error("MG06_CONFLICT");
      } else store.add(next);
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
    await this.source.assertFrozen(epoch);
    if (!saved || !this.matches(saved, snapshot, id, epoch))
      throw new Error("MG06_READBACK");
    return saved.checkpoint;
  }
  private matches(
    saved: StagedDiagnostics,
    snapshot: DiagnosticsSnapshot,
    id: string,
    epoch: number,
  ) {
    const expected = convertMg06(snapshot, saved.createdAt);
    return (
      saved.schema === "wca.mg06-stage/v1" &&
      saved.key === this.key(id) &&
      saved.migrationId === id &&
      saved.epoch === epoch &&
      saved.expiresAt > this.now() &&
      saved.expiresAt ===
        Math.min(
          saved.createdAt + diagnosticsTtl,
          ...expected.records.map((row) => row.expiresAt),
        ) &&
      migrationDigest(snapshot) === saved.checkpoint.sourceDigest &&
      migrationDigest(expected) === saved.checkpoint.targetDigest &&
      canonicalJson(expected) === canonicalJson(saved.conversion) &&
      saved.checkpoint.sourceCount === expected.sourceCount &&
      saved.checkpoint.copied === expected.records.length &&
      saved.checkpoint.quarantined === expected.quarantine.length
    );
  }
  async validate(id: string, epoch: number, checkpoint: Checkpoint) {
    const { snapshot } = await diagnosticsSource(this.source, epoch);
    const saved = await this.read(id);
    await this.source.assertFrozen(epoch);
    return (
      !!saved &&
      canonicalJson(saved.checkpoint) === canonicalJson(checkpoint) &&
      this.matches(saved, snapshot, id, epoch)
    );
  }
}
