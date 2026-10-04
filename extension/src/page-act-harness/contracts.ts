import {
  traceBranch,
  traceDecision,
  traceMethod,
} from "../diagnostics/method-trace.js";

// Internal proposal only — not a finalized provider/shared-wire schema.
// See design §4.1: `page-act-context/v1-proposed` is a Browser-internal proposal.
export const PAGE_ACT_CONTEXT_VERSION = "page-act-context/v1-proposed" as const;

export type ActRequestMode = "act" | "ask";
export type InventoryState = "AVAILABLE" | "NOT_READ" | "READING" | "READ";
export type ReadStatus =
  | "AVAILABLE"
  | "NOT_FOUND"
  | "DENIED"
  | "UNSUPPORTED"
  | "CONSENT_REQUIRED"
  | "STALE"
  | "FAILED";
export type ReviewVerdict = "match" | "partial" | "mismatch" | "needs_context";
export type HarnessState =
  | "BOOTSTRAPPING"
  | "REASONING"
  | "READING"
  | "WAITING_USER"
  | "PLAN_REVIEW"
  | "WAITING_APPROVAL"
  | "PREFLIGHT"
  | "EXECUTING"
  | "OBSERVING"
  | "VERIFYING"
  | "TERMINAL";
export type TerminalKind =
  | "ANSWER_ONLY"
  | "VERIFIED"
  | "GOAL_VERIFIED"
  | "FAILED"
  | "UNKNOWN"
  | "INCOMPLETE";

export type RequestRef = {
  request_id: string;
  revision: number;
  mode: ActRequestMode;
  text: string;
};

export type DocumentBinding = {
  document_epoch: string;
  page_scope_epoch: string;
};

export type ObservedControl = {
  // UI-local model ref (e.g. "m1"): short-lived, scoped to one observation.
  // Must never carry raw URL/selector/function names; persistent log IDs
  // elsewhere in this file must satisfy isOpaqueId().
  model_ref: string;
  role: string;
  name: string;
  visible: boolean;
  enabled: boolean;
};

export type ObservationCoverage = {
  complete: boolean;
  reason: string;
  scope_detail?: string;
  omitted?: string[];
};

export type Observation = {
  evidence_id: string;
  scope: "visible_only";
  controls: ObservedControl[];
  coverage: ObservationCoverage;
};

export type ResourceItem = {
  resource_id: string;
  kind: string;
  state: "AVAILABLE" | "CONSENT_REQUIRED" | "UNSUPPORTED" | "DENIED";
};

export type ResourceInventory = {
  inventory_id: string;
  items: ResourceItem[];
  next_cursor: string | null;
};

export type WorkflowInventoryState = {
  sources: Array<"saved" | "profile" | "page_generated">;
  state: InventoryState;
};

export type CapabilityInventory = {
  read: string[];
  propose: string[];
  script_read: "AVAILABLE" | "CONSENT_REQUIRED" | "UNSUPPORTED";
};

// PAH-0 partial scope: dialog/history summary, operating instructions,
// description excerpt, and execution boundary arrive in PAH-1/PAH-6.
// They are optional here so PAH-0 only pins down revision/binding/coverage.
export type BootstrapEnvelope = {
  context_version: typeof PAGE_ACT_CONTEXT_VERSION;
  request: RequestRef;
  binding: DocumentBinding;
  observation: Observation;
  resources: ResourceInventory;
  workflow_inventory: WorkflowInventoryState;
  capabilities: CapabilityInventory;
  unsupported_capabilities?: Array<{ name: string; reason: string }>;
  history_summary?: { evidence_refs: string[]; note: string };
  operating_instructions_ref?: string;
  description_excerpt?: { evidence_id: string; text: string };
  execution_boundary?: {
    permission_mode: string;
    source_transfer: string;
    approval_revision: number;
  };
  omitted?: string[];
};

export type EvidenceCoverage = {
  scope: string;
  complete: boolean;
  collected_count?: number;
  supplied_count?: number;
  total_count?: number;
  truncated: boolean;
  reason?: string;
};

export type MaskingMetadata = {
  applied: boolean;
  categories: string[];
  redacted_count: number;
};

export type ReadEvidence = {
  evidence_id: string;
  request_revision: number;
  binding_revision: string;
  resource_id: string;
  resource_revision: string;
  kind: string;
  status: ReadStatus;
  content?: unknown;
  coverage: EvidenceCoverage;
  continuation?: { cursor: string; reason: string };
  masking: MaskingMetadata;
  limitations: string[];
};

const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const TEXT_LIMIT = 4000;
const READ_STATUSES: ReadStatus[] = [
  "AVAILABLE",
  "NOT_FOUND",
  "DENIED",
  "UNSUPPORTED",
  "CONSENT_REQUIRED",
  "STALE",
  "FAILED",
];

// Plain predicate (no trace wrapper): hot-path helper, not a method boundary.
// Callers log decisions via traceDecision at the validation boundary.
export const isOpaqueId = (value: string): boolean =>
  typeof value === "string" && OPAQUE_ID.test(value);

const invalid = (
  context: unknown,
  method: string,
  branch: string,
  code: string,
  condition: string,
): never => {
  traceBranch(context as never, method, branch, code, condition);
  throw new Error(code);
};

export const validateBootstrapEnvelope = (
  envelope: BootstrapEnvelope,
): BootstrapEnvelope =>
  traceMethod(
    "page-act-harness/contracts.ts:validateBootstrapEnvelope",
    {
      context_version: envelope?.context_version,
      request_revision: envelope?.request?.revision,
    },
    (context) => {
      if (envelope.context_version !== PAGE_ACT_CONTEXT_VERSION)
        invalid(
          context,
          "page-act-harness/contracts.ts:validateBootstrapEnvelope",
          "fail",
          "CONTEXT_VERSION_MISMATCH",
          "context_version must equal page-act-context/v1-proposed",
        );
      if (!envelope.request || !isOpaqueId(envelope.request.request_id))
        invalid(
          context,
          "page-act-harness/contracts.ts:validateBootstrapEnvelope",
          "fail",
          "REQUEST_ID_INVALID",
          "request_id must be opaque (no URL/selector)",
        );
      if (envelope.request.revision < 1)
        invalid(
          context,
          "page-act-harness/contracts.ts:validateBootstrapEnvelope",
          "fail",
          "REQUEST_REVISION_INVALID",
          "revision starts at 1",
        );
      if (!envelope.request.text || envelope.request.text.length > TEXT_LIMIT)
        invalid(
          context,
          "page-act-harness/contracts.ts:validateBootstrapEnvelope",
          "fail",
          "REQUEST_TEXT_INVALID",
          "original text required, keyword classification must not replace it",
        );
      if (
        !envelope.binding?.document_epoch ||
        !envelope.binding?.page_scope_epoch ||
        !isOpaqueId(envelope.binding.document_epoch) ||
        !isOpaqueId(envelope.binding.page_scope_epoch)
      )
        invalid(
          context,
          "page-act-harness/contracts.ts:validateBootstrapEnvelope",
          "fail",
          "BINDING_INVALID",
          "document/page_scope epoch required as opaque ids",
        );
      if (!isOpaqueId(envelope.observation.evidence_id))
        invalid(
          context,
          "page-act-harness/contracts.ts:validateBootstrapEnvelope",
          "fail",
          "OBSERVATION_EVIDENCE_ID_INVALID",
          "observation evidence_id must be opaque",
        );
      if (envelope.observation.coverage.complete)
        invalid(
          context,
          "page-act-harness/contracts.ts:validateBootstrapEnvelope",
          "fail",
          "COVERAGE_OVERCLAIM",
          "initial summary must not claim complete",
        );
      if (!isOpaqueId(envelope.resources.inventory_id))
        invalid(
          context,
          "page-act-harness/contracts.ts:validateBootstrapEnvelope",
          "fail",
          "INVENTORY_ID_INVALID",
          "inventory_id must be opaque",
        );
      for (const item of envelope.resources.items) {
        if (!isOpaqueId(item.resource_id))
          invalid(
            context,
            "page-act-harness/contracts.ts:validateBootstrapEnvelope",
            "fail",
            "RESOURCE_ID_INVALID",
            "resource_id must be opaque (no filename/URL leak)",
          );
      }
      if (
        envelope.capabilities.read.length === 0 &&
        envelope.capabilities.propose.length === 0
      )
        invalid(
          context,
          "page-act-harness/contracts.ts:validateBootstrapEnvelope",
          "fail",
          "CAPABILITY_EMPTY",
          "at least one offered tool required",
        );
      traceDecision("page-act-harness.bootstrap.validated", {
        revision: envelope.request.revision,
        binding_stale: false,
        included: [
          "request",
          "binding",
          "observation",
          "resources",
          "capabilities",
        ],
        omitted: envelope.omitted ?? [],
        read_tools: envelope.capabilities.read,
        propose_tools: envelope.capabilities.propose,
      });
      return envelope;
    },
  );

export const validateReadEvidence = (evidence: ReadEvidence): ReadEvidence =>
  traceMethod(
    "page-act-harness/contracts.ts:validateReadEvidence",
    {
      evidence_present: typeof evidence?.evidence_id === "string",
      status: (evidence as ReadEvidence)?.status,
    },
    (context) => {
      const method = "page-act-harness/contracts.ts:validateReadEvidence";
      if (!READ_STATUSES.includes(evidence.status))
        invalid(
          context,
          method,
          "fail",
          "INVALID_STATUS_CONFUSION",
          "NOT_READ is inventory state, never a read status",
        );
      if (!evidence.evidence_id || !isOpaqueId(evidence.evidence_id))
        invalid(
          context,
          method,
          "fail",
          "EVIDENCE_ID_INVALID",
          "evidence_id must be opaque",
        );
      if (!isOpaqueId(evidence.resource_id))
        invalid(
          context,
          method,
          "fail",
          "RESOURCE_ID_INVALID",
          "resource_id must be opaque",
        );
      if (!evidence.masking || typeof evidence.masking.applied !== "boolean")
        invalid(
          context,
          method,
          "fail",
          "MASKING_REQUIRED",
          "masking metadata required",
        );
      if (!evidence.limitations)
        invalid(
          context,
          method,
          "fail",
          "LIMITATIONS_REQUIRED",
          "limitations required",
        );
      if (evidence.coverage.truncated && !evidence.continuation)
        invalid(
          context,
          method,
          "fail",
          "CONTINUATION_REQUIRED",
          "truncated coverage requires continuation cursor",
        );
      if (
        evidence.coverage.total_count !== undefined &&
        evidence.coverage.total_count < 0
      )
        invalid(
          context,
          method,
          "fail",
          "TOTAL_COUNT_INVALID",
          "unknown total must be omitted, not zero",
        );
      if (
        evidence.status === "CONSENT_REQUIRED" &&
        evidence.content !== undefined
      )
        invalid(
          context,
          method,
          "fail",
          "CONSENT_BODY_LEAK",
          "body must not accompany CONSENT_REQUIRED",
        );
      if (evidence.status !== "AVAILABLE" && evidence.content !== undefined)
        invalid(
          context,
          method,
          "fail",
          "FAILURE_BODY_LEAK",
          "non-AVAILABLE read must not carry a success body",
        );
      if (evidence.status !== "AVAILABLE" && evidence.coverage.complete)
        invalid(
          context,
          method,
          "fail",
          "FAILURE_COMPLETE_OVERCLAIM",
          "failed/denied/stale read must not claim complete",
        );
      traceDecision("page-act-harness.evidence.validated", {
        status: evidence.status,
        truncated: evidence.coverage.truncated,
        has_continuation: Boolean(evidence.continuation),
        masking_applied: evidence.masking.applied,
        masking_categories: evidence.masking.categories,
        redacted_count: evidence.masking.redacted_count,
      });
      return evidence;
    },
  );

export const isTerminalState = (state: HarnessState): boolean =>
  state === "TERMINAL";

export type HarnessEvent =
  | "BOOTSTRAP_DONE"
  | "NEEDS_READ"
  | "READ_DONE"
  | "NEEDS_USER"
  | "USER_DONE"
  | "PLAN_READY"
  | "APPROVAL_REQUESTED"
  | "APPROVED"
  | "PREFLIGHT_OK"
  | "DISPATCHED"
  | "OBSERVED"
  | "VERIFIED_NEXT"
  | "FINISH"
  | "STOP"
  | "STALE_BINDING"
  | "PROVIDER_FAILED"
  | "BUDGET_EXHAUSTED";

export const nextHarnessState = (
  from: HarnessState,
  event: HarnessEvent,
): HarnessState =>
  traceMethod(
    "page-act-harness/contracts.ts:nextHarnessState",
    { from, event },
    (context) => {
      const method = "page-act-harness/contracts.ts:nextHarnessState";
      // Failure terminal path (§6.3): Stop/stale/provider/budget from any
      // non-terminal state moves to TERMINAL; terminal kind (FAILED/UNKNOWN/
      // INCOMPLETE) is recorded separately via TerminalKind.
      const terminalEvents: HarnessEvent[] = [
        "STOP",
        "STALE_BINDING",
        "PROVIDER_FAILED",
        "BUDGET_EXHAUSTED",
      ];
      if (terminalEvents.includes(event) && from !== "TERMINAL") {
        traceDecision("page-act-harness.state.terminal", { from, event });
        return "TERMINAL";
      }
      const table: Record<string, HarnessState> = {
        "BOOTSTRAPPING:BOOTSTRAP_DONE": "REASONING",
        "REASONING:NEEDS_READ": "READING",
        "READING:READ_DONE": "REASONING",
        "REASONING:NEEDS_USER": "WAITING_USER",
        "WAITING_USER:USER_DONE": "REASONING",
        "REASONING:PLAN_READY": "PLAN_REVIEW",
        "PLAN_REVIEW:APPROVAL_REQUESTED": "WAITING_APPROVAL",
        "WAITING_APPROVAL:APPROVED": "PREFLIGHT",
        "PREFLIGHT:PREFLIGHT_OK": "EXECUTING",
        "EXECUTING:DISPATCHED": "OBSERVING",
        "OBSERVING:OBSERVED": "VERIFYING",
        "VERIFYING:VERIFIED_NEXT": "REASONING",
        "REASONING:FINISH": "TERMINAL",
      };
      const next = table[`${from}:${event}`];
      if (!next) {
        traceBranch(
          context,
          method,
          "fail",
          "STATE_TRANSITION_INVALID",
          `${from} + ${event} is not an allowed transition`,
        );
        throw new Error("STATE_TRANSITION_INVALID");
      }
      traceDecision("page-act-harness.state.transition", {
        from,
        event,
        next,
      });
      return next;
    },
  );

// Plain comparison (no raw epoch logging): epochs may carry sensitive
// material pre-masking, so only the boolean result is traced.
export const isStaleBinding = (
  envelopeBinding: DocumentBinding,
  currentBinding: DocumentBinding,
): boolean => {
  const stale =
    envelopeBinding.document_epoch !== currentBinding.document_epoch ||
    envelopeBinding.page_scope_epoch !== currentBinding.page_scope_epoch;
  traceDecision("page-act-harness.binding.stale_checked", { stale });
  return stale;
};
