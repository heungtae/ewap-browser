import { randomUUID } from "node:crypto";

export function referenceCase(item) {
  return { ...item, taskId: `sequence-${randomUUID()}` };
}
const relationDescriptions = {
  form_filters_table:
    "Submitting the equipment search form filters the alarm result table",
  date_filters_table:
    "The alarm date control filters the alarm result table by the selected day",
  table_contains_rows:
    "The alarm result table contains the displayed alarm rows",
};
function relationPage(s27, c) {
  const context = s27.scenarioContext(c);
  const inputs = Object.entries(relationDescriptions).map(
    ([id, description]) => ({
      candidate: {
        id,
        semanticId: id,
        description,
        source: "graph",
        scopeId: context.scopeId,
        modes: ["ask", "act"],
        capabilityRefs: ["qualified-fixture"],
        evidenceRefs: ["observed-alarm-page"],
        unresolvedInputs: [],
        bindingDigests: {},
        steps: [],
      },
      policyPermitted: true,
      uniqueTarget: true,
      fresh: true,
      userMentionMatch: 0,
      workflowMatch: false,
      evidenceTime: 1,
    }),
  );
  const page = s27.enumerateCandidates(
    context,
    inputs,
    new Set(["qualified-fixture"]),
  );
  if (c.order !== "reversed") return page;
  const { id: _id, digest: _digest, ...payload } = page;
  payload.candidates.reverse();
  return {
    ...payload,
    id: `set:${s27.digest(payload)}`,
    digest: s27.digest(payload),
  };
}
function phaseFacts(c, phase, prior) {
  const facts = [{ id: "user_request", value: c.request }];
  if (prior.length)
    facts.push({
      id: "prior_decisions",
      value: prior
        .map((item) => `${item.phase}:${item.selection ?? "unavailable"}`)
        .join(", "),
    });
  const analysis = c.scenario === "analysis",
    search = c.scenario === "search";
  if (["semantic_selection", "semantic_relation"].includes(phase)) {
    facts.push({
      id: "observed",
      value:
        "The current equipment search form filters the alarm result table. The current date control also filters the alarm result table. The table contains the displayed alarm rows.",
    });
    facts.push({
      id: "selection_purpose",
      value:
        phase === "semantic_relation"
          ? search
            ? "Identify the relation connecting an equipment search to displayed alarms."
            : analysis
              ? "Identify the relation connecting the requested day to displayed alarms."
              : "Identify how the displayed alarm records relate to their table."
          : search
            ? "Identify where the requested equipment identifier is entered."
            : analysis
              ? "Identify the control needed to set the requested previous local day."
              : "Identify the collection holding the current alarm rows.",
    });
  }
  if (phase === "evidence_sufficiency") {
    facts.push({
      id: "decision_scope",
      value:
        "Assess evidence required to propose the next step only; no action is assumed to have been dispatched.",
    });
    facts.push({
      id: "observed",
      value: search
        ? "The user's identifier is present; the unique current equipment search form and field are observed and permitted."
        : analysis
          ? "The user's relative-day expression, admission timezone, current permitted date control and alarm data source are available."
          : "The user's request and a current authorized table of alarm rows are available.",
    });
  }
  if (phase === "next_tool")
    facts.push({
      id: "observed",
      value:
        "The current equipment search form and date control each filter the current alarm table. The current task has not dispatched a page mutation.",
    });
  if (phase === "processor")
    facts.push({
      id: "data_scope",
      value: analysis
        ? "For this independent processor decision, the requested records have already been acquired and authorized; determine how to interpret them."
        : "For this independent processor decision, assess the operation requested by the user.",
    });
  if (phase === "recovery")
    facts.push({
      id: "recovery_observation",
      value:
        "In this independent recovery observation, an operation outcome is uncertain; no permitted safe observation is available and the operation must not be repeated.",
    });
  if (phase === "result_acceptance")
    facts.push({
      id: "result_observation",
      value:
        "In this independent synthetic observation, a document observer and result verifier produced separate successful receipts for the current task, document revision and requested goal.",
    });
  return facts;
}
export function referencePhase(s27, c, phase, budget, prior) {
  const original = s27.scenarioFrame(c, phase, budget);
  let page =
    phase === "semantic_relation"
      ? relationPage(s27, c)
      : original.candidateSet;
  if (phase === "evidence_sufficiency") {
    const { id: _id, digest: _digest, ...payload } = page;
    payload.candidates = payload.candidates.map((candidate) => ({
      ...candidate,
      description:
        candidate.id === "ACCEPT"
          ? "The evidence required to propose the next step is present"
          : "A required observation for proposing the next step is missing",
    }));
    page = {
      ...payload,
      id: `set:${s27.digest(payload)}`,
      digest: s27.digest(payload),
    };
  }
  const { digest: _digest, ...payload } = original;
  const frame = s27.createFrame({
    ...payload,
    templateVersion: "controller-v2",
    candidateSet: page,
    facts: phaseFacts(c, phase, prior),
  });
  const expected =
    phase === "semantic_relation"
      ? {
          aggregation: "table_contains_rows",
          search: "form_filters_table",
          analysis: "date_filters_table",
        }[c.scenario]
      : phase === "recovery"
        ? "STOP"
        : c.expected[phase];
  return { frame, expected };
}
