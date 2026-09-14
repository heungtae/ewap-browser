import { validDiagnostic } from "../contracts/diagnostics-validation.js";
export type DiagnosticsPage = {
  records: unknown[];
  dropped_count: number;
  level: string;
  storage_failed: boolean;
};
export const readDiagnostics = async (
  send: (message: unknown) => Promise<Record<string, unknown>>,
  id: string,
): Promise<DiagnosticsPage> => {
  const value: DiagnosticsPage = {
    records: [],
    dropped_count: 0,
    level: "basic",
    storage_failed: false,
  };
  let cursor = 0;
  for (let page = 0; page < 3; page += 1) {
    const result = await send({
      schema_version: 1,
      kind: "DIAGNOSTICS_LIST",
      request_id: id,
      after_sequence: cursor,
      limit: 100,
    });
    if (!Array.isArray(result.records)) throw new Error("INVALID_ARGUMENT");
    value.records.push(...result.records.filter(validDiagnostic));
    value.dropped_count =
      typeof result.dropped_count === "number" &&
      Number.isSafeInteger(result.dropped_count) &&
      result.dropped_count >= 0
        ? result.dropped_count
        : 0;
    value.level = ["off", "basic", "debug"].includes(String(result.level))
      ? String(result.level)
      : "basic";
    value.storage_failed = result.storage_failed === true;
    if (
      result.records.length < 100 ||
      typeof result.next_sequence !== "number" ||
      result.next_sequence <= cursor
    )
      break;
    cursor = result.next_sequence;
  }
  return value;
};
