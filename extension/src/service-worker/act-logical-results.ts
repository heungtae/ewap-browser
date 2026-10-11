import type { ActExecutionEvidence } from "./act-execution-evidence.js";

/** Retain every raw attempt; only a proven pre-dispatch rejection can recover. */
export const logicalActionResults = (
  attempts: ActExecutionEvidence[],
): ActExecutionEvidence[] => {
  const groups = new Map<string, ActExecutionEvidence[]>();
  for (const attempt of attempts) {
    const key = attempt.logical_step_id ?? attempt.action_id;
    const group = groups.get(key) ?? [];
    group.push(attempt);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => {
    if (
      group.length === 2 &&
      group[0]!.outcome === "FAILED" &&
      group[0]!.dispatch === "not_dispatched" &&
      ["TARGET_NOT_ACTIONABLE", "TARGET_STALE"].includes(
        group[0]!.code ?? "",
      ) &&
      group[1]!.outcome === "VERIFIED"
    )
      return group[1]!;
    return (
      group.find((attempt) => attempt.outcome === "FAILED") ??
      group.find((attempt) => attempt.outcome === "UNKNOWN") ??
      group.at(-1)!
    );
  });
};
