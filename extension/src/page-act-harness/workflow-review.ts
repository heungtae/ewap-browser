import {
  traceBranch,
  traceDecision,
  traceMethod,
} from "../diagnostics/method-trace.js";
import { isOpaqueId, type ReviewVerdict } from "./contracts.js";

export type WorkflowSource = "saved" | "profile" | "page_generated";
export type ProvenanceKind =
  | "description"
  | "inline_code"
  | "external_code"
  | "legacy_declaration";

export type WorkflowCandidateInput = {
  candidate_id: string;
  source: WorkflowSource;
  title: string;
  definition_revision: string;
  stored_scope?: { origin: string; path: string };
  current_origin?: string;
  signature?: { present: boolean; valid: boolean };
  catalog_status: "verified" | "draft" | "stale" | "incomparable";
  required_capabilities: string[];
  required_evidence_kinds: string[];
};

export type ReviewContext = {
  request_revision: number;
  evidence_ids: string[];
  evidence_kinds: string[];
  available_capabilities: string[];
  binding_current: boolean;
  cross_origin: boolean;
};

export type SuitabilityReview = {
  candidate_id: string;
  source: WorkflowSource;
  verdict: ReviewVerdict;
  rationale: string;
  evidence_ids: string[];
  missing: string[];
  executable: boolean;
  executable_reason: string;
  // Policy display status (catalog staleness) is echoed separately and never
  // merged into the technical executable flag (design §8.1).
  catalog_status: WorkflowCandidateInput["catalog_status"];
  catalog_note: string | null;
  provenance: ProvenanceKind[];
  origin_diff: string | null;
  signed_warning: string | null;
  approval_note: string;
  // Step targets, inputs, side effects, plan diffs, and alternatives belong
  // to the submit_plan contract (PAH-6), not to this suitability verdict.
};

export const reviewCandidate = (
  candidate: WorkflowCandidateInput,
  llmVerdict: ReviewVerdict,
  rationale: string,
  context: ReviewContext,
  provenance: ProvenanceKind[],
): SuitabilityReview =>
  traceMethod(
    "page-act-harness/workflow-review.ts:reviewCandidate",
    { candidate_id: candidate.candidate_id, source: candidate.source },
    (ctx) => {
      const method = "page-act-harness/workflow-review.ts:reviewCandidate";
      const fail = (code: string, condition: string): never => {
        traceBranch(ctx, method, "fail", code, condition);
        throw new Error(code);
      };
      if (!isOpaqueId(candidate.candidate_id))
        fail("CANDIDATE_ID_INVALID", "candidate id must be opaque");
      if (!rationale || rationale.trim().length === 0)
        fail("RATIONALE_REQUIRED", "explainable verdict required");
      if (context.evidence_ids.length === 0)
        fail("EVIDENCE_REQUIRED", "review without evidence is not reviewable");
      if (provenance.length === 0)
        fail("PROVENANCE_REQUIRED", "generation provenance required");
      if (
        !Number.isInteger(context.request_revision) ||
        context.request_revision < 1
      )
        fail("REQUEST_REVISION_INVALID", "revision starts at 1");
      // The core never substitutes the model's semantic verdict by source
      // rank, title, signature, or keyword heuristics (design §8.1). This
      // module takes no rank/threshold parameters by design.
      // needs_context stays the model's call: listed kinds being present
      // never proves nothing else is needed (another chunk, a second
      // script, a fresher observation), so the core must not refuse it.
      const missing = candidate.required_evidence_kinds.filter(
        (kind) => !context.evidence_kinds.includes(kind),
      );
      if (llmVerdict === "needs_context" && missing.length === 0)
        traceDecision("page-act-harness.workflow.needs_context_open", {
          candidate_id: candidate.candidate_id,
          rationale_length: rationale.trim().length,
        });
      const originDiff =
        candidate.stored_scope && candidate.current_origin
          ? candidate.stored_scope.origin === candidate.current_origin
            ? null
            : `stored:${candidate.stored_scope.origin} current:${candidate.current_origin}`
          : null;
      // Cross-origin is derived from stored vs current scope, never trusted
      // from the caller flag alone.
      if (
        (candidate.source === "saved" || candidate.source === "profile") &&
        (!candidate.stored_scope || !candidate.current_origin)
      )
        fail(
          "SCOPE_REQUIRED",
          "saved/profile review needs stored and current scope",
        );
      const derivedCrossOrigin =
        originDiff !== null || context.cross_origin === true;
      let executable = true;
      let executableReason = "EXECUTABLE";
      if (!context.binding_current) {
        executable = false;
        executableReason = "STALE_BINDING";
      } else if (derivedCrossOrigin) {
        executable = false;
        executableReason = "CROSS_ORIGIN_BLOCKED";
      } else {
        const lacking = candidate.required_capabilities.filter(
          (cap) => !context.available_capabilities.includes(cap),
        );
        if (lacking.length > 0) {
          executable = false;
          executableReason = `MISSING_CAPABILITY:${lacking.join(",")}`;
        }
      }
      const catalogNote =
        candidate.catalog_status === "verified" ||
        candidate.catalog_status === "draft"
          ? null
          : `catalog ${candidate.catalog_status}: policy display state, independent of technical executability`;
      const signedWarning =
        candidate.source === "profile" &&
        candidate.signature?.present === true &&
        candidate.signature.valid === false
          ? "signature invalid: suitability and approval are separate; a signed-but-unrelated candidate never changes the request"
          : null;
      // executable===true never authorizes dispatch on its own: a
      // mismatch/partial verdict still needs an explicit user pick plus
      // re-review, and signed definitions never transfer approval to a draft.
      const approvalNote =
        "dispatch requires explicit user selection and re-review; signed approval is never inherited by a modified draft";
      const review: SuitabilityReview = {
        candidate_id: candidate.candidate_id,
        source: candidate.source,
        verdict: llmVerdict,
        rationale,
        evidence_ids: context.evidence_ids,
        missing,
        executable,
        executable_reason: executableReason,
        catalog_status: candidate.catalog_status,
        catalog_note: catalogNote,
        provenance,
        origin_diff: originDiff,
        signed_warning: signedWarning,
        approval_note: approvalNote,
      };
      traceDecision("page-act-harness.workflow.reviewed", {
        candidate_id: candidate.candidate_id,
        source: candidate.source,
        definition_revision: candidate.definition_revision,
        request_revision: context.request_revision,
        verdict: llmVerdict,
        evidence_ids: context.evidence_ids,
        provenance,
        catalog_status: candidate.catalog_status,
        origin_diff: originDiff,
        executable,
        executable_reason: executableReason,
        missing,
        signed_warning: signedWarning,
      });
      return review;
    },
  );

export const reReviewAfterUserSelection = (
  prior: SuitabilityReview,
  freshContext: ReviewContext,
  userResponse: { user_response_evidence_id: string; new_revision?: number },
): { requires_fresh_evidence: true; goal_note: string } =>
  traceMethod(
    "page-act-harness/workflow-review.ts:reReviewAfterUserSelection",
    { candidate_id: prior.candidate_id },
    () => {
      // Re-review marker only: a user-picked unfitting candidate is reviewed
      // again on latest evidence. The original goal is kept; changing it
      // needs an actual user response carried into a new request revision.
      if (!isOpaqueId(userResponse.user_response_evidence_id))
        throw new Error("USER_RESPONSE_EVIDENCE_INVALID");
      traceDecision("page-act-harness.workflow.reselected", {
        candidate_id: prior.candidate_id,
        prior_verdict: prior.verdict,
        fresh_revision: freshContext.request_revision,
        user_response_evidence_id: userResponse.user_response_evidence_id,
      });
      return {
        requires_fresh_evidence: true as const,
        goal_note: `re-review on revision ${freshContext.request_revision} after user response ${userResponse.user_response_evidence_id}`,
      };
    },
  );

export const buildPageGeneratedDraft = (opts: {
  draft_id: string;
  request_revision: number;
  evidence_ids: string[];
  provenance: ProvenanceKind[];
  summary: string;
  page_declaration_ref?: string;
}): {
  draft_id: string;
  request_revision: number;
  evidence_ids: string[];
  provenance: ProvenanceKind[];
  summary: string;
  mutates_original: false;
  inherits_approval: false;
} =>
  traceMethod(
    "page-act-harness/workflow-review.ts:buildPageGeneratedDraft",
    { request_revision: opts.request_revision },
    () => {
      if (!isOpaqueId(opts.draft_id)) throw new Error("DRAFT_ID_INVALID");
      if (!Number.isInteger(opts.request_revision) || opts.request_revision < 1)
        throw new Error("REQUEST_REVISION_INVALID");
      if (opts.evidence_ids.length === 0) throw new Error("EVIDENCE_REQUIRED");
      if (opts.provenance.length === 0) throw new Error("PROVENANCE_REQUIRED");
      if (!opts.summary || opts.summary.trim().length === 0)
        throw new Error("SUMMARY_REQUIRED");
      // Page-generated plans are new drafts: the stored original is never
      // edited, shrunk, or marked successful in place (design §8.2), and a
      // page declaration is input material only — never a 4th auto-run
      // candidate. Signed approval is never inherited by the draft.
      const draft = {
        ...opts,
        mutates_original: false as const,
        inherits_approval: false as const,
      };
      traceDecision("page-act-harness.draft.built", {
        draft_id: opts.draft_id,
        request_revision: opts.request_revision,
        evidence_count: opts.evidence_ids.length,
        provenance: opts.provenance,
      });
      return draft;
    },
  );
