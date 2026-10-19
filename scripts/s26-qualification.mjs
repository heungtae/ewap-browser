/** Scope checking is deliberately independent of test/HTTP success. */
export function requireQualification(evidence, requestedScope) {
  if (evidence.result !== "PASS" || evidence.scope !== requestedScope)
    throw new Error(`Insufficient evidence for ${requestedScope}`);
  if (requestedScope !== "fixture" && !evidence.runtime_identity)
    throw new Error("Missing qualified runtime identity");
  return true;
}
