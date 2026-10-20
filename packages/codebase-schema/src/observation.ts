import { z } from "zod";
import { contextSchema, coverageSchema, hash, id, revision } from "./common.js";
export const componentKinds = [
  "table",
  "grid",
  "tree",
  "list",
  "listbox",
  "form",
  "dialog",
  "tabpanel",
  "group",
  "visual",
  "region",
  "singleton",
] as const;
export const observationSchema = z.strictObject({
  evidenceId: id,
  parentEvidenceId: id.nullable(),
  sourceLocation: hash,
  role: z.string().max(32),
  kind: z.enum(componentKinds).nullable(),
  name: z.string().max(200),
  stableKey: hash.nullable(),
  visible: z.boolean(),
  enabled: z.boolean(),
  editable: z.boolean(),
  checked: z.boolean().nullable(),
  selected: z.boolean().nullable(),
  control: z
    .enum(["button", "link", "text", "select", "checkbox", "radio"])
    .nullable(),
  inputType: z.string().max(32).nullable(),
  required: z.boolean(),
  min: z.string().max(64).nullable(),
  max: z.string().max(64).nullable(),
  step: z.string().max(64).nullable(),
  pattern: z.string().max(200).nullable(),
  options: z.array(z.string().max(200)).max(20),
  routeKey: hash.nullable(),
  headers: z.array(z.string().max(200)).max(20),
  sample: z.array(z.array(z.string().max(200)).max(20)).max(5),
});
export const batchBodySchema = z.strictObject({
  schema: z.literal("wca.codebase/v1"),
  batchId: id,
  context: contextSchema,
  expectedRevision: revision,
  collectorVersion: z.literal("dom-v1"),
  budgetVersion: z.literal("construction-v1"),
  scope: z.enum(["visible_only", "all_dom"]),
  observedAt: revision,
  records: z.array(observationSchema).max(1000),
  coverage: coverageSchema.refine(
    (c) => c.examined <= 5000 && c.emitted <= 1000,
    "DISCOVERY_LIMIT",
  ),
});
export const batchSchema = batchBodySchema.extend({
  digest: hash,
  bytes: revision.max(262144),
});
export type Observation = z.infer<typeof observationSchema>;
export type Batch = z.infer<typeof batchSchema>;
