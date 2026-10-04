import { traceDecision, traceMethod } from "../diagnostics/method-trace.js";

export type ContractOwner = "browser-internal" | "workspace-spec" | "platform";
export type MigrationAction = "keep" | "adapter" | "migrate" | "contract-first";

export type CompatibilityEntry = {
  area: string;
  owner: ContractOwner;
  current: string;
  harness_expectation: string;
  action: MigrationAction;
  external_change_required: boolean;
};

export const PAH0_COMPATIBILITY_TABLE: CompatibilityEntry[] = [
  {
    area: "bootstrap/evidence/resource/cursor/plan/review internal schema",
    owner: "browser-internal",
    current: "act-step-runner single proposal; no shared read evidence",
    harness_expectation:
      "page-act-context/v1-proposed envelope + ReadEvidence with revision binding",
    action: "adapter",
    external_change_required: false,
  },
  {
    area: "Ask read runner / Act executor reuse",
    owner: "browser-internal",
    current: "ask-tools + ask-tool-executor read-only; act-tools propose-only",
    harness_expectation:
      "shared read infrastructure, mode-separated permissions",
    action: "adapter",
    external_change_required: false,
  },
  {
    area: "local catalog provenance/outcome storage",
    owner: "browser-internal",
    current: "saved_workflows_v1 schema_version 1; run_terminal VERIFIED",
    harness_expectation:
      "provenance/outcome stored separately; new terminal kinds additive",
    action: "migrate",
    external_change_required: false,
  },
  {
    area: "provider tool round-trip",
    owner: "browser-internal",
    current: "single propose_* call per turn; tool result continuation ad-hoc",
    harness_expectation:
      "read loop with tool_call_id + evidence binding + duplicate rejection",
    action: "adapter",
    external_change_required: false,
  },
  {
    area: "workspace specs/workflow.schema.json + page-profile.schema.json",
    owner: "workspace-spec",
    current: "shared ewap/v1 Workflow assumed compatible",
    harness_expectation:
      "Browser-local declaration kept distinct; no silent wire change",
    action: "contract-first",
    external_change_required: false,
  },
  {
    area: "Platform resource-api / workflow-designer contracts",
    owner: "platform",
    current: "resolver-supplied definitions; MCP resource supply future",
    harness_expectation:
      "resolver vs MCP supply distinguished; no fake MCP completion claim",
    action: "contract-first",
    external_change_required: false,
  },
];

// Plain classifier (no trace wrapper); unknown areas must be reviewed
// explicitly instead of silently falling back to browser-internal.
export const decideContractOwner = (
  area: string,
): { owner: ContractOwner; action: MigrationAction } => {
  const normalized = area.toLowerCase();
  if (
    normalized.includes("workflow.schema") ||
    normalized.includes("page-profile.schema") ||
    normalized.includes("workspace")
  )
    return { owner: "workspace-spec", action: "contract-first" };
  if (
    normalized.includes("platform") ||
    normalized.includes("resource-api") ||
    normalized.includes("workflow-designer") ||
    normalized.includes("mcp")
  )
    return { owner: "platform", action: "contract-first" };
  if (
    normalized.includes("bootstrap") ||
    normalized.includes("evidence") ||
    normalized.includes("act") ||
    normalized.includes("ask") ||
    normalized.includes("read") ||
    normalized.includes("plan") ||
    normalized.includes("browser")
  )
    return { owner: "browser-internal", action: "keep" };
  throw new Error("NEEDS_CONTRACT_REVIEW");
};

export const assertNoExternalWireChange = (
  entries: CompatibilityEntry[],
): CompatibilityEntry[] =>
  traceMethod(
    "page-act-harness/compatibility.ts:assertNoExternalWireChange",
    { entry_count: entries.length },
    () => {
      const violations = entries.filter(
        (entry) =>
          entry.owner !== "browser-internal" && entry.external_change_required,
      );
      traceDecision("page-act-harness.compatibility.checked", {
        entry_count: entries.length,
        violation_count: violations.length,
        areas: violations.map((entry) => entry.area),
      });
      if (violations.length > 0)
        throw new Error("EXTERNAL_WIRE_CHANGE_REQUIRED");
      return entries;
    },
  );

export type ReproFinding = {
  request_id: string;
  workflow_selected: boolean;
  offered_tools: string[];
  input_tool_offered: boolean;
  actual_input_observed: boolean;
  outcome: string;
  cause: string;
};

export const summarizePreviewInputRepro = (
  finding: ReproFinding,
): ReproFinding =>
  traceMethod(
    "page-act-harness/compatibility.ts:summarizePreviewInputRepro",
    {
      workflow_selected: finding.workflow_selected,
      input_tool_offered: finding.input_tool_offered,
    },
    () => {
      if (
        finding.workflow_selected &&
        !finding.input_tool_offered &&
        finding.actual_input_observed
      ) {
        const reproduced = {
          ...finding,
          cause:
            "WORKFLOW_STEP_TOOL_SCOPING: Preview step narrowed offered tools so page-present textbox was unreachable",
          outcome: "REPRODUCED",
        };
        traceDecision("page-act-harness.pah0.repro", {
          outcome: reproduced.outcome,
          cause: reproduced.cause,
        });
        return reproduced;
      }
      const recorded = { ...finding, outcome: "RECORDED" };
      traceDecision("page-act-harness.pah0.repro", {
        outcome: recorded.outcome,
      });
      return recorded;
    },
  );
