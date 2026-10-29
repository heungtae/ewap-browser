// An unlabeled case tests response validity, not semantic correctness.
export function expectedSelections(expected) {
  if (expected === null || expected === undefined) return null;
  if (expected === "UNKNOWN") return ["UNKNOWN", "INSPECT_MORE"];
  if (typeof expected !== "string" || !expected)
    throw new Error("INVALID_EXPECTATION");
  return [expected];
}
export function selectionMatches(expected, selection) {
  const allowed = expectedSelections(expected);
  return (
    typeof selection === "string" &&
    selection.length > 0 &&
    (allowed === null || allowed.includes(selection))
  );
}
