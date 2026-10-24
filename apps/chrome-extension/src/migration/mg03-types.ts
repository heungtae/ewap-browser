export const sourceKeys = [
  "saved_workflows_v1",
  "learned_page_profiles_v1",
] as const;
export type SourceKey = (typeof sourceKeys)[number];
export type Snapshot = Partial<Record<SourceKey, unknown>>;
export interface AdvisoryRecord {
  sourceKey: SourceKey;
  sourceIndex: number;
  sourceId: string;
  sourceDigest: string;
  executable: false;
  requiresFreshValidation: true;
  metadata: unknown;
}
export interface Quarantine {
  sourceKey: SourceKey;
  sourceIndex: number;
  reason: "INVALID_CONTAINER" | "INVALID_RECORD" | "DUPLICATE_ID";
}
export interface Conversion {
  schema: "wca.mg03-advisory/v1";
  records: AdvisoryRecord[];
  quarantine: Quarantine[];
  sourceCount: number;
}
