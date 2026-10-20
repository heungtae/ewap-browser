import {
  advisoryInputSchema,
  digest,
  opaque,
  type Entity,
} from "@contextpilot/codebase-schema";
export interface AdvisoryImport {
  source: "learned" | "recorded";
  sourceId: string;
  title: string;
  sourceRevision: number;
  successfulAt: number;
  steps: { tool: string; label: string }[];
}
export interface AdvisoryHistory {
  id: string;
  source: "learned" | "recorded";
  sourceDigest: string;
  sourceRevision: number;
  successfulAt: number;
  stepLabels: string[];
}
export async function importAdvisory(
  input: AdvisoryImport,
  page: Entity,
): Promise<{ entity: Entity; history: AdvisoryHistory }> {
  input = advisoryInputSchema.parse(input);
  if (
    !input.sourceId ||
    input.steps.length > 64 ||
    !Number.isSafeInteger(input.sourceRevision) ||
    input.sourceRevision < 0 ||
    !Number.isSafeInteger(input.successfulAt)
  )
    throw new Error("IMPORT_INVALID");
  const allowed = new Set([
    "web.click",
    "web.fill",
    "web.select",
    "web.navigate",
    "click_by_ref",
    "fill_by_ref",
    "select_option",
  ]);
  if (input.steps.some((s) => !allowed.has(s.tool)))
    throw new Error("IMPORT_TOOL_UNSUPPORTED");
  const sourceDigest = await digest([
    input.source,
    input.sourceId,
    input.sourceRevision,
  ]);
  const id = await opaque("entity", [
    page.partitionId,
    input.source,
    input.sourceId,
  ]);
  return {
    entity: {
      ...page,
      id,
      parentId: page.id,
      kind: "workflow",
      name: input.title.normalize("NFC").slice(0, 200),
      status: "advisory",
      evidenceIds: [],
      stableKey: null,
      capability: null,
      fields: [],
      sample: [],
      semanticAnnotation: null,
      state: null,
      structureFingerprint: sourceDigest,
      stateFingerprint: await digest(input.successfulAt),
    },
    history: {
      id,
      source: input.source,
      sourceDigest,
      sourceRevision: input.sourceRevision,
      successfulAt: input.successfulAt,
      stepLabels: input.steps.map((s) => s.label.slice(0, 200)),
    },
  };
}
export function proposeAnnotation(): never {
  throw new Error("JEV_QUALIFICATION_REQUIRED");
}
