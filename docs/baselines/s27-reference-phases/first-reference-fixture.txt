import { randomUUID } from "node:crypto";

export function referenceFrame(
  s27,
  item,
  budget,
  taskId = `reference-${randomUUID()}`,
) {
  const c = { ...item, taskId };
  const binding = s27.scenarioBindings(c);
  const original = s27.scenarioFrame(c, "next_tool", budget);
  const { digest: _digest, ...payload } = original;
  const frame = s27.createFrame({
    ...payload,
    templateVersion: "controller-v2",
  });
  return { c, frame, binding };
}

export function expectedArguments(scenario) {
  if (scenario === "aggregation") return { dataset: "current-alarms" };
  if (scenario === "search") return { equipment: "EQP001" };
  if (scenario === "analysis")
    return {
      dataset: "current-alarms",
      date_range: {
        timezone: "Asia/Seoul",
        start: "2026-10-17T15:00:00.000Z",
        end: "2026-10-18T15:00:00.000Z",
      },
    };
  throw new Error("REFERENCE_SCENARIO_INVALID");
}

export function alternateSource(s27, name, binding) {
  const sources = new Map(binding.sources);
  let context = binding.context;
  if (name === "equipment") {
    const original = sources.get(name);
    const replacement = context.request.slice(0, 1);
    sources.set(name, {
      ...original,
      start: 0,
      end: 1,
      spanDigest: s27.digest(replacement),
    });
  } else if (name === "dataset") {
    const old = context.observed.get("alarms");
    context = {
      ...context,
      observed: new Map([["alarms", { ...old, value: "other-alarms" }]]),
    };
  } else if (name === "date_range") {
    context = { ...context, timezone: "America/New_York" };
  } else throw new Error("REFERENCE_ARGUMENT_INVALID");
  return { sources, context };
}
