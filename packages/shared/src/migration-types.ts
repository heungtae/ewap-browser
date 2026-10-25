import type { migrationUnits } from "./migration.js";
export type Unit = (typeof migrationUnits)[number];
export interface Manifest {
  migrationId: string;
  profileGuard?: string;
  sourceSchemas: string;
  targetSchemas: string;
  sourceDigests: Record<Unit, string>;
  legacyRelease: string;
  targetRelease: string;
}
export interface Checkpoint {
  sourceDigest: string;
  targetDigest: string;
  copied: number;
  quarantined: number;
  sourceCount: number;
}
export interface Journal {
  manifest: Manifest;
  revision: number;
  epoch: number;
  phase: "prepared" | "copying" | "validated" | "committed" | "rolled_back";
  stores: Partial<Record<Unit, Checkpoint>>;
  acknowledgments: Partial<Record<"extension" | "backend", string>>;
}
