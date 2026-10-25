import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
export function presentationGate(report, expectedNames) {
  const blockers = [];
  const cases = report.presentation?.cases ?? [];
  if (
    report.result !== "PASS" ||
    report.automaticRecovery !== true ||
    report.pageLifecycleAndReload !== true ||
    report.focusPreserved !== true
  )
    blockers.push("PRESENTATION_RECOVERY_UNVERIFIED");
  if (
    expectedNames.some(
      (name) => cases.filter((item) => item.name === name).length !== 1,
    )
  )
    blockers.push("M00_STATE_COVERAGE_INCOMPLETE");
  if (
    cases.some(
      (item) =>
        item.result !== "MATCH" ||
        item.viewportMatch !== true ||
        item.fontMatch !== true ||
        ["missing", "extra", "changed"].some(
          (key) => !Array.isArray(item[key]) || item[key].length,
        ),
    )
  )
    blockers.push("M00_PRESENTATION_DIFFERENCES");
  if (
    report.presentation?.result !== "PASS" ||
    !Array.isArray(report.presentation?.unverified) ||
    report.presentation.unverified.length
  )
    blockers.push("INTERACTION_CONTINUITY_UNVERIFIED");
  return {
    result: blockers.length ? "BLOCKED" : "PASS",
    scope: "S36-R03 presentation only",
    compared: cases.length,
    required: expectedNames.length,
    blockers,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const baseline = JSON.parse(
    readFileSync("docs/baselines/s26/ui/report.json", "utf8"),
  );
  const report = JSON.parse(
    readFileSync(
      process.argv[2] ??
        "docs/evidence/s36-presentation-chrome-2026-10-25/report.json",
      "utf8",
    ),
  );
  const result = presentationGate(
    report,
    baseline.captures.map((item) => item.name),
  );
  console.log(JSON.stringify(result));
  process.exitCode = result.result === "PASS" ? 0 : 2;
}
