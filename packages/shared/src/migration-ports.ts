import type { Journal, Manifest, Checkpoint, Unit } from "./migration-types.js";
import type { MigrationOwnerAck } from "./migration.js";
export type BrowserMigrationUnit = Exclude<Unit, "MG01">;
export interface MigrationStagingPort {
  sourceDigest(epoch: number): Promise<string>;
  stage(
    id: string,
    epoch: number,
    expectedSourceDigest: string,
  ): Promise<Checkpoint>;
  validate(id: string, epoch: number, checkpoint: Checkpoint): Promise<boolean>;
}
export interface BrowserMigrationPort {
  readonly profileGuard: string;
  freezeAndDrain(
    epoch: number,
  ): Promise<{ ready: boolean; unknownDispatches: number }>;
  assertFrozen(epoch: number): Promise<void>;
  sourceDigest(unit: Unit, epoch: number): Promise<string>;
  stage(
    unit: BrowserMigrationUnit,
    manifest: Manifest,
    epoch: number,
  ): Promise<Checkpoint>;
  validate(
    unit: BrowserMigrationUnit,
    id: string,
    epoch: number,
    checkpoint: Checkpoint,
  ): Promise<boolean>;
  acknowledge(view: Journal): Promise<MigrationOwnerAck>;
  verifyAcknowledgment(view: Journal): Promise<boolean>;
}
