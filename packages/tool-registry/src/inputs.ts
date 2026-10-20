import { z } from "zod";
import { id, refSchema } from "./identity.js";
import { querySchema } from "@contextpilot/codebase-schema";
const target = (kind: z.infer<typeof refSchema>["kind"]) =>
  refSchema.refine((r) => r.kind === kind, "REF_KIND");
const page = target("page"),
  action = target("action"),
  predicate = target("predicate"),
  argument = target("argument");
export const inputSchemas = {
  "web.discover": z.strictObject({
    page,
    scope: z.enum(["visible_only", "all_dom"]),
  }),
  "web.search_codebase": z.strictObject({
    page,
    name: z.string().max(200),
    limit: z.number().int().min(1).max(128),
  }),
  "web.inspect": z.strictObject({
    target: refSchema,
    inspection: z.enum(["structure", "state", "schema", "source_slice"]),
    fields: z.array(z.string().max(64)).max(50),
  }),
  "web.get_capabilities": z.strictObject({ target: refSchema }),
  "web.navigate": z.strictObject({ route: target("route") }),
  "web.switch_tab": z.strictObject({ tab: target("tab") }),
  "web.click": z.strictObject({
    action,
    activation: z.literal("primary"),
    argument: argument.optional(),
  }),
  "web.fill": z.strictObject({ action, argument }),
  "web.select": z.strictObject({ action, argument }),
  "web.scroll": z.strictObject({
    target: refSchema,
    direction: z.enum(["up", "down"]),
    extent: z.number().int().min(1).max(1000),
  }),
  "web.wait_for": z.strictObject({
    predicate,
    timeoutMs: z.number().int().min(1).max(10000),
  }),
  "web.extract": z.strictObject({
    target: refSchema,
    fields: z.array(z.string().max(200)).max(50),
    coverage: z.enum(["viewport", "complete"]),
  }),
  "web.query": z.strictObject({
    dataset: target("dataset"),
    query: querySchema,
  }),
  "web.get_chart_data": z.strictObject({
    target: refSchema,
    channel: z.enum(["accessible", "registered", "visual"]),
  }),
  "web.get_table_data": z.strictObject({
    target: refSchema,
    coverage: z.enum(["viewport", "complete"]),
    cursor: id.nullable(),
  }),
  "web.get_observed_api": z.strictObject({
    page,
    limit: z.number().int().min(1).max(100),
  }),
  "analysis.run": z.strictObject({
    datasets: z.array(target("dataset")).min(1).max(16),
    objective: z.string().min(1).max(2000),
  }),
  "task.verify": z.strictObject({
    predicates: z.array(predicate).min(1).max(16),
    goalRevision: z.number().int().nonnegative(),
  }),
  "task.request_approval": z.strictObject({ prepared: target("prepared") }),
  "task.complete": z.strictObject({
    outcome: z.enum(["verified", "unknown"]),
    evidence: z.array(target("entity")).max(32),
    goalRevision: z.number().int().nonnegative(),
  }),
  "web.invoke_action": z.strictObject({
    action,
    arguments: z
      .array(z.strictObject({ parameter: id, source: argument }))
      .max(16),
  }),
};
export const toolIds = Object.keys(
  inputSchemas,
) as (keyof typeof inputSchemas)[];
export type ToolId = keyof typeof inputSchemas;
export const toolIdSchema = z.enum(toolIds as [ToolId, ...ToolId[]]);
export function parseIntent(tool: ToolId, input: unknown): unknown {
  return inputSchemas[tool].parse(input);
}
