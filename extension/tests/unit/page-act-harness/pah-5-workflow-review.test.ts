import { describe, expect, it } from "vitest";
import {
  buildPageGeneratedDraft,
  reReviewAfterUserSelection,
  reviewCandidate,
} from "../../../src/page-act-harness/workflow-review.js";

// PAH-5 unit slice: verdict pass-through per source, re-review marker, and
// draft separation. Live suitability judgement and Chrome example migration
// are verified live, not here (§12).
const context = () => ({
  request_revision: 1,
  evidence_ids: ["ev-ui-abcdefghijklmnop", "ev-read-abcdefghijklmnop"],
  evidence_kinds: ["ui", "description"],
  available_capabilities: ["propose_set_text", "read_page"],
  binding_current: true,
  cross_origin: false,
});

const scope = () => ({
  stored_scope: { origin: "https://app.test", path: "/items" },
  current_origin: "https://app.test",
});

describe("PAH-5 workflow review", () => {
  it("passes_the_llm_verdict_through_per_source_without_rank_override", () => {
    for (const source of ["saved", "profile", "page_generated"] as const) {
      const review = reviewCandidate(
        {
          candidate_id: "candidate-aaaaaaaaaaaaa1",
          source,
          title: "candidate",
          definition_revision: "rev-aaaaaaaaaaaaaaa1",
          catalog_status: "verified",
          required_capabilities: ["propose_set_text"],
          required_evidence_kinds: ["ui"],
          ...(source === "page_generated" ? {} : scope()),
        },
        "match",
        "current textbox matches the input goal",
        context(),
        ["description"],
      );
      expect(review.verdict).toBe("match");
      expect(review.executable).toBe(true);
      expect(review.evidence_ids).toEqual(context().evidence_ids);
      expect(review.approval_note).toContain("never inherited");
    }
  });

  it("keeps_needs_context_mismatch_and_partial_distinct", () => {
    const partial = reviewCandidate(
      {
        candidate_id: "candidate-aaaaaaaaaaaaa1",
        source: "saved",
        title: "preview flow",
        definition_revision: "rev-aaaaaaaaaaaaaaa1",
        catalog_status: "verified",
        required_capabilities: ["propose_set_text"],
        required_evidence_kinds: ["ui"],
        ...scope(),
      },
      "partial",
      "first step fits, scope step needs confirmation",
      context(),
      ["description"],
    );
    expect(partial.verdict).toBe("partial");
    const needsContext = reviewCandidate(
      {
        candidate_id: "candidate-aaaaaaaaaaaaa1",
        source: "saved",
        title: "preview flow",
        definition_revision: "rev-aaaaaaaaaaaaaaa1",
        catalog_status: "verified",
        required_capabilities: ["propose_set_text"],
        required_evidence_kinds: ["ui", "script"],
        ...scope(),
      },
      "needs_context",
      "script corroboration unread",
      context(),
      ["description", "inline_code"],
    );
    expect(needsContext.missing).toContain("script");
    const mismatch = reviewCandidate(
      {
        candidate_id: "candidate-bbbbbbbbbbbbb1",
        source: "profile",
        title: "preview flow",
        definition_revision: "rev-bbbbbbbbbbbbbbb1",
        catalog_status: "verified",
        required_capabilities: ["propose_set_text"],
        required_evidence_kinds: ["ui"],
        signature: { present: true, valid: false },
        ...scope(),
      },
      "mismatch",
      "report-scope flow does not satisfy a search input goal",
      context(),
      ["description"],
    );
    expect(mismatch.signed_warning).toContain("never changes the request");
  });

  it("accepts_needs_context_for_material_beyond_the_listed_kinds", () => {
    // Listed kinds being present never proves nothing else is needed: the
    // model may still lack another chunk, script, or fresher observation.
    const review = reviewCandidate(
      {
        candidate_id: "candidate-aaaaaaaaaaaaa1",
        source: "saved",
        title: "input flow",
        definition_revision: "rev-aaaaaaaaaaaaaaa1",
        catalog_status: "verified",
        required_capabilities: ["propose_set_text"],
        required_evidence_kinds: ["ui"],
        ...scope(),
      },
      "needs_context",
      "ui seen, but the handler wiring needs one more script chunk",
      context(),
      ["description"],
    );
    expect(review.verdict).toBe("needs_context");
    expect(review.missing).toEqual([]);
  });

  it("requests_a_fresh_evidence_marker_after_an_unfitting_pick", () => {
    const prior = reviewCandidate(
      {
        candidate_id: "candidate-bbbbbbbbbbbbb1",
        source: "saved",
        title: "Preview",
        definition_revision: "rev-bbbbbbbbbbbbbbb1",
        catalog_status: "verified",
        required_capabilities: ["propose_set_text"],
        required_evidence_kinds: ["ui"],
        ...scope(),
      },
      "mismatch",
      "preview scope step is unrelated to search input",
      context(),
      ["description"],
    );
    const again = reReviewAfterUserSelection(prior, context(), {
      user_response_evidence_id: "ev-user-abcdefghijklmnop",
    });
    expect(again.requires_fresh_evidence).toBe(true);
    expect(again.goal_note).toContain("revision 1");
  });

  it("marks_page_generated_drafts_as_non_mutating_without_approval", () => {
    const draft = buildPageGeneratedDraft({
      draft_id: "draft-abcdefghijklmnop",
      request_revision: 1,
      evidence_ids: ["ev-ui-abcdefghijklmnop"],
      provenance: ["description", "inline_code"],
      summary: "type into the observed Search query box",
    });
    expect(draft.mutates_original).toBe(false);
    expect(draft.inherits_approval).toBe(false);
    expect(draft.provenance).toContain("inline_code");
  });

  it("blocks_on_stale_binding_and_echoes_stale_catalogs_separately", () => {
    const stale = reviewCandidate(
      {
        candidate_id: "candidate-aaaaaaaaaaaaa1",
        source: "saved",
        title: "input flow",
        definition_revision: "rev-aaaaaaaaaaaaaaa1",
        catalog_status: "stale",
        required_capabilities: ["propose_set_text"],
        required_evidence_kinds: ["ui"],
        ...scope(),
      },
      "match",
      "semantically fitting but technically stale",
      { ...context(), binding_current: false },
      ["description"],
    );
    expect(stale.verdict).toBe("match");
    expect(stale.executable).toBe(false);
    expect(stale.executable_reason).toBe("STALE_BINDING");
    expect(stale.catalog_note).toContain("stale");
    const policyStale = reviewCandidate(
      {
        candidate_id: "candidate-aaaaaaaaaaaaa1",
        source: "saved",
        title: "input flow",
        definition_revision: "rev-aaaaaaaaaaaaaaa1",
        catalog_status: "incomparable",
        required_capabilities: ["propose_set_text"],
        required_evidence_kinds: ["ui"],
        ...scope(),
      },
      "match",
      "catalog policy state differs from technical executability",
      context(),
      ["description"],
    );
    expect(policyStale.executable).toBe(true);
    expect(policyStale.catalog_note).toContain("incomparable");
  });

  it("derives_cross_origin_from_scope_instead_of_trusting_the_flag", () => {
    const review = reviewCandidate(
      {
        candidate_id: "candidate-aaaaaaaaaaaaa1",
        source: "saved",
        title: "input flow",
        definition_revision: "rev-aaaaaaaaaaaaaaa1",
        catalog_status: "verified",
        required_capabilities: ["propose_set_text"],
        required_evidence_kinds: ["ui"],
        stored_scope: { origin: "https://app.test", path: "/items" },
        current_origin: "https://other.test",
      },
      "match",
      "scope differs",
      context(),
      ["description"],
    );
    expect(review.executable).toBe(false);
    expect(review.executable_reason).toBe("CROSS_ORIGIN_BLOCKED");
    expect(review.origin_diff).toContain("other.test");
  });
});
