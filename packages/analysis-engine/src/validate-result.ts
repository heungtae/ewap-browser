import { resultSchema, type AnalysisInput, type Finding } from "./contracts.js";
import { safeLabel, sanitize } from "./privacy.js";
export const groundedSummary = (findings: Finding[]): string =>
  findings
    .map(
      (f) =>
        `${f.datasetId}${f.field === null ? "" : `.${f.field}`} ${f.op} = ${JSON.stringify(f.value)}`,
    )
    .join("\n");
export function validateResult(input: AnalysisInput, raw: unknown) {
  const result = resultSchema.parse(raw);
  if (
    result.taskId !== input.taskId ||
    result.attemptId !== input.attemptId ||
    result.inputDigest !== input.inputDigest
  )
    throw new Error("ANALYSIS_RESULT_BINDING");
  for (const finding of result.findings) {
    const data = input.datasets.find((d) => d.id === finding.datasetId);
    if (
      !data ||
      data.digest !== finding.digest ||
      new Set(finding.evidenceIds).size !== finding.evidenceIds.length ||
      !finding.evidenceIds.every((id) => data.evidenceIds.includes(id))
    )
      throw new Error("ANALYSIS_EVIDENCE_INVALID");
    if (finding.op === "cell") {
      const row = data.rowIds.indexOf(finding.rowId ?? "");
      const field = data.fields.findIndex((f) => f.name === finding.field);
      if (row < 0 || field < 0 || data.rows[row]?.[field] !== finding.value)
        throw new Error("ANALYSIS_UNSUPPORTED_FINDING");
    } else {
      const fact = data.aggregates.find(
        (f) => f.op === finding.op && f.field === finding.field,
      );
      if (!fact || finding.rowId !== null || fact.value !== finding.value)
        throw new Error("ANALYSIS_CONTRADICTORY_TOTAL");
    }
  }
  if (
    result.summary !== groundedSummary(result.findings) ||
    result.recommendations.length
  )
    throw new Error("ANALYSIS_UNSUPPORTED_NARRATIVE");
  for (const data of input.datasets) {
    if (data.partial && !result.limitations.includes("PARTIAL_COVERAGE"))
      throw new Error("ANALYSIS_MISSING_LIMITATION");
    if (data.redacted && !result.limitations.includes("REDACTED"))
      throw new Error("ANALYSIS_MISSING_LIMITATION");
  }
  if (
    result.additionalData.length &&
    !result.limitations.includes("MORE_DATA_REQUIRED")
  )
    throw new Error("ANALYSIS_MISSING_LIMITATION");
  if (!result.findings.length && !result.additionalData.length)
    throw new Error("ANALYSIS_EMPTY_RESULT");
  for (const request of result.additionalData) {
    if (!input.datasets.some((d) => d.id === request.datasetId))
      throw new Error("ANALYSIS_FOREIGN_DATA_REQUEST");
    request.fields.forEach(safeLabel);
  }
  if (sanitize(result.summary) !== result.summary)
    throw new Error("ANALYSIS_UNSAFE_OUTPUT");
  return {
    result,
    status: result.additionalData.length
      ? ("NEEDS_DATA" as const)
      : ("SUPPORTED" as const),
  };
}
