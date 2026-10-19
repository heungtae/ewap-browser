import {
  digest,
  type DecisionContext,
  type BindingContext,
} from "../../../packages/task-engine/src/decisions/index.js";
export type HoldoutCase = {
  id: string;
  scenario: string;
  language: string;
  request: string;
  order: string;
  mode: "ask" | "act";
  admittedAt: string;
  timezone: string;
  expected: Record<string, string>;
  taskId?: string;
};
export const scenarioContext = (c: HoldoutCase): DecisionContext => ({
  taskId: c.taskId ?? c.id,
  taskRevision: 1,
  planRevision: 1,
  graphRevision: 1,
  evidenceRevision: 1,
  capabilityRevision: 1,
  cancellationGeneration: 0,
  mode: c.mode,
  scopeId: "alarm-page",
});
export function scenarioBindings(c: HoldoutCase) {
  const current = scenarioContext(c),
    record = (value: string) => ({
      value,
      unit: null,
      authorized: true,
      sensitive: false,
      contextDigest: digest(current),
      graphRevision: 1,
      evidenceRevision: 1,
    });
  const context: BindingContext = {
    current,
    request: c.request,
    sensitiveSpans: [],
    admittedAt: c.admittedAt,
    timezone: c.timezone,
    approved: new Map(),
    observed: new Map([["alarms", record("current-alarms")]]),
  };
  const sources = new Map<string, unknown>([
    [
      "dataset",
      {
        kind: "observed_value",
        ref: "alarms",
        graphRevision: 1,
        evidenceRevision: 1,
        valueType: "string",
        unit: null,
      },
    ],
  ]);
  if (c.scenario === "search") {
    const start = c.request.indexOf("EQP001");
    sources.set("equipment", {
      kind: "user_span",
      start,
      end: start + 6,
      spanDigest: digest("EQP001"),
      valueType: "string",
      unit: null,
    });
  }
  if (c.scenario === "analysis") {
    const word = c.language === "ko" ? "어제" : "yesterday",
      start = c.request.indexOf(word);
    sources.set("date_range", {
      kind: "derived_value",
      transform: "relative-day-v1",
      valueType: "date_range",
      unit: null,
      sources: [
        {
          kind: "user_span",
          start,
          end: start + word.length,
          spanDigest: digest(word),
          valueType: "string",
          unit: null,
        },
      ],
    });
  }
  return { context, sources };
}
