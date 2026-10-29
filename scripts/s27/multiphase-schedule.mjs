import { phases } from "./multiphase-vocabulary.mjs";

// Each phase is an independent observation. Vary only conditions relevant to it.
export function schedule() {
  const rows = [];
  for (const phase of phases) {
    for (const reverse of [false, true]) {
      if (phase === "intent") {
        for (const intentMode of ["ask", "act"])
          rows.push({
            phase,
            condition: { complete: true, inspect: false, reverse, intentMode },
          });
      } else if (
        ["evidence_sufficiency", "result_acceptance"].includes(phase)
      ) {
        for (const complete of [false, true])
          rows.push({
            phase,
            condition: { complete, inspect: false, reverse, intentMode: null },
          });
      } else if (phase === "recovery") {
        for (const inspect of [false, true])
          rows.push({
            phase,
            condition: { complete: true, inspect, reverse, intentMode: null },
          });
      } else
        rows.push({
          phase,
          condition: {
            complete: true,
            inspect: false,
            reverse,
            intentMode: null,
          },
        });
    }
  }
  return rows;
}
