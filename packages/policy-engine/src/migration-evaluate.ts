import {
  contextSchema,
  effectSchema,
  toolIdSchema,
  type ToolContext,
  type Effect,
  type ToolId,
} from "@contextpilot/tool-registry";
import { evaluate } from "./evaluate.js";
import {
  mg02PolicySchema,
  migrationHost,
  type MigratedPolicy,
  type legacyCapabilities,
} from "./migration-contract.js";
type Capability = (typeof legacyCapabilities)[number];
const capabilities: Record<ToolId, readonly Capability[]> = {
  "web.discover": ["page_api_read"],
  "web.search_codebase": ["page_api_read"],
  "web.inspect": ["page_api_read"],
  "web.get_capabilities": ["page_api_read"],
  "web.navigate": ["navigate"],
  "web.switch_tab": ["navigate"],
  "web.click": ["click"],
  "web.fill": ["type"],
  "web.select": ["click", "type"],
  "web.scroll": ["collection_read"],
  "web.wait_for": ["page_api_read"],
  "web.extract": ["collection_read", "page_api_read"],
  "web.query": ["collection_read", "page_api_read"],
  "web.get_chart_data": ["collection_read", "page_api_read"],
  "web.get_table_data": ["collection_read", "page_api_read"],
  "web.get_observed_api": ["page_api_read"],
  "analysis.run": ["collection_read", "page_api_read"],
  "task.verify": ["page_api_read"],
  "task.request_approval": [],
  "task.complete": [],
  "web.invoke_action": [
    "page_method",
    "page_api",
    "network_write",
    "download",
    "upload",
    "schedule",
  ],
};
const mutators = new Set<ToolId>([
  "web.navigate",
  "web.switch_tab",
  "web.click",
  "web.fill",
  "web.select",
  "web.invoke_action",
]);
// Inputs here must be freshly bound by the existing runtime/UI authority path.
// This adapter issues no approval receipt and treats every imported allow as ask.
export function evaluateMigratedPolicy(
  raw: MigratedPolicy,
  input: {
    tool: ToolId;
    effect: Effect;
    context: ToolContext;
    url: string;
    freshSiteConsent: boolean;
    planApproved: boolean;
    visionRequested: boolean;
    manualVisionRequest: boolean;
    readScope: "all_dom" | "visible_only" | "interactive";
  },
): "deny" | "explicit" {
  const policy = mg02PolicySchema.parse(raw);
  const context = contextSchema.parse(input.context),
    effect = effectSchema.parse(input.effect),
    tool = toolIdSchema.parse(input.tool);
  const prefs = policy.preferences;
  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    return "deny";
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    !(url.protocol === "https:" || (url.protocol === "http:" && loopback)) ||
    (!loopback && !migrationHost.safeParse(url.hostname).success) ||
    !["all_dom", "visible_only", "interactive"].includes(input.readScope) ||
    typeof input.visionRequested !== "boolean" ||
    typeof input.manualVisionRequest !== "boolean" ||
    policy.blocked ||
    input.freshSiteConsent !== true ||
    prefs.policyRevision !== context.policyRevision ||
    (prefs.toolScope === "approved_plan" && input.planApproved !== true)
  )
    return "deny";
  const needed = new Set(capabilities[tool]);
  if (effect.mechanism === "navigate") needed.add("navigate");
  if (
    ["write", "destructive", "external_transfer", "unknown"].includes(
      effect.business,
    )
  )
    for (const cap of [
      "network_write",
      "download",
      "upload",
      "schedule",
    ] as const)
      needed.add(cap);
  if (
    policy.records.some(
      (row) =>
        row.kind === "permission" &&
        row.decision === "deny" &&
        row.host === url.hostname &&
        needed.has(row.capability),
    )
  )
    return "deny";
  const denied = (category: keyof typeof prefs.categories) =>
    prefs.categories[category] === "deny";
  const mutation = mutators.has(tool) || effect.mechanism !== "read";
  if (
    denied("tool_permission") ||
    denied("plan_approval") ||
    (mutation && denied("action_execution")) ||
    (tool === "web.invoke_action" && !prefs.pageMethodEnabled) ||
    ((tool === "web.scroll" || effect.bulk) && denied("scroll_read")) ||
    (effect.disclosure &&
      (denied("source_disclosure") ||
        denied("runtime_data_disclosure") ||
        denied("vision_disclosure"))) ||
    ([
      "analysis.run",
      "web.inspect",
      "web.invoke_action",
      "web.get_observed_api",
    ].includes(tool) &&
      (denied("source_disclosure") || denied("runtime_data_disclosure"))) ||
    (input.visionRequested &&
      (prefs.screenshotPolicy === "disabled" ||
        input.manualVisionRequest !== true ||
        denied("vision_disclosure"))) ||
    ((effect.bulk ||
      effect.sensitive ||
      ["write", "destructive", "external_transfer", "unknown"].includes(
        effect.business,
      )) &&
      denied("risk_confirmation")) ||
    (context.mode === "ask" && mutation)
  )
    return "deny";
  if (
    !mutation &&
    prefs.defaultReadScope !== "all_dom" &&
    input.readScope !== prefs.defaultReadScope
  )
    return "deny";
  const result = evaluate(
    {
      revision: prefs.policyRevision,
      mode: "custom",
      siteAllowed: true,
      deniedTools: [],
      autoUnsubmitted: false,
      boundedWrite: false,
    },
    tool,
    effect,
    context,
  );
  return result === "deny" ? "deny" : "explicit";
}
