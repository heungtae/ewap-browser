import {
  traceBranch,
  traceDecision,
  traceMethod,
} from "../diagnostics/method-trace.js";

export type ScenarioResult = "PASS" | "FAIL" | "NOT_VERIFIED";

export type ScenarioRecord = {
  scenario: string;
  control: ScenarioResult;
  live: ScenarioResult;
  note: string;
};

export type ScenarioOverall = "PASS" | "FAIL" | "NOT_VERIFIED";

// Live evidence Alb (design §12): model/provider/prompt/build revisions,
// initial context, safe tool trace, before/after state, attempts, failures,
// extra reads, and latency. Unit records carry no live evidence, so live
// stays NOT_VERIFIED until a live Chrome run attaches it (TODO live-evidence).
export type LiveEvidence = {
  model_revision: string;
  provider: string;
  prompt_revision: string;
  build_revision: string;
  attempts: number;
  failures: number;
  extra_reads: number;
  latency_ms: number;
};

export const REQUIRED_SCENARIOS = [
  "summary-outside-description",
  "script-id-unknown-partial-read",
  "consent-denied-sensitive-string",
  "grid-chart-list-svg-unclassified",
  "three-source-match-partial-mismatch-needs-context",
  "preview-selected-for-search",
  "preview-without-declaration",
  "answer-without-tools",
  "stale-stop-restart-timeout",
  "large-context-budget-compaction",
  "storage-provider-ask-regression",
  "shared-contract-platform-link",
] as const;

export const recordScenario = (
  record: ScenarioRecord,
): ScenarioRecord & { overall: ScenarioOverall } =>
  traceMethod(
    "page-act-harness/verification-matrix.ts:recordScenario",
    { scenario: record.scenario },
    (context) => {
      // Overall ignores the control column: a live failure is never
      // replaced by a control PASS, and a control PASS never implies live.
      const overall: ScenarioOverall =
        record.live === "PASS"
          ? "PASS"
          : record.live === "FAIL"
            ? "FAIL"
            : "NOT_VERIFIED";
      if (record.live === "FAIL" && record.control === "PASS") {
        traceBranch(
          context,
          "page-act-harness/verification-matrix.ts:recordScenario",
          "live-fail",
          record.scenario,
          "control pass does not mask live failure",
        );
      }
      traceDecision("page-act-harness.scenario.recorded", {
        scenario: record.scenario,
        control: record.control,
        live: record.live,
        overall,
      });
      return { ...record, overall };
    },
  );

export const summarizeMatrix = (
  records: Array<ScenarioRecord & { overall: ScenarioOverall }>,
): { total: number; pass: number; fail: number; not_verified: number } => {
  const summary = {
    total: records.length,
    pass: records.filter((r) => r.overall === "PASS").length,
    fail: records.filter((r) => r.overall === "FAIL").length,
    not_verified: records.filter((r) => r.overall === "NOT_VERIFIED").length,
  };
  traceDecision("page-act-harness.matrix.summarized", summary);
  return summary;
};

export type HoldoutSpec = {
  label_variant: string;
  dom_variant: string;
  script_variant: string;
  component_variant: string;
  per_page_product_code: false;
};

export const defineHoldoutPage = (spec: HoldoutSpec): HoldoutSpec =>
  traceMethod(
    "page-act-harness/verification-matrix.ts:defineHoldoutPage",
    { label_variant: spec.label_variant },
    () => {
      // Holdout pages must exercise the generic harness with renamed
      // labels/DOM/scripts/components and zero per-page product code.
      if (spec.per_page_product_code !== false)
        throw new Error("HOLDOUT_PRODUCT_CODE_FORBIDDEN");
      for (const [key, value] of Object.entries(spec)) {
        if (key === "per_page_product_code") continue;
        if (typeof value !== "string" || value.trim().length === 0)
          throw new Error(`HOLDOUT_VARIANT_EMPTY:${key}`);
      }
      traceDecision("page-act-harness.holdout.defined", {
        label_variant: spec.label_variant,
        dom_variant: spec.dom_variant,
        script_variant: spec.script_variant,
        component_variant: spec.component_variant,
      });
      return spec;
    },
  );

export type ReleaseGate = {
  build_ok: boolean;
  chrome_runtime_ok: boolean;
  live_reasoning_ok: boolean;
  // compat_ok is a single rollup bit: its evidence (Ask/Act/permission/
  // record/session/diagnostic compat, old storage reads, and the
  // contract-first chain via compatibility.ts) must be attached separately.
  compat_ok: boolean;
  release_approved: boolean;
};

export const checkReleaseGate = (
  gate: ReleaseGate,
): { shippable: boolean; reasons: string[] } =>
  traceMethod(
    "page-act-harness/verification-matrix.ts:checkReleaseGate",
    { build_ok: gate.build_ok },
    () => {
      // Build, runtime, reasoning, and release approval are reported
      // separately: none implies another.
      const reasons: string[] = [];
      if (!gate.build_ok) reasons.push("BUILD_FAILED");
      if (!gate.chrome_runtime_ok) reasons.push("CHROME_RUNTIME_UNVERIFIED");
      if (!gate.live_reasoning_ok) reasons.push("LIVE_REASONING_UNVERIFIED");
      if (!gate.compat_ok) reasons.push("COMPAT_UNVERIFIED");
      if (!gate.release_approved) reasons.push("RELEASE_NOT_APPROVED");
      const shippable = reasons.length === 0;
      traceDecision("page-act-harness.release.gate", { shippable, reasons });
      return { shippable, reasons };
    },
  );
