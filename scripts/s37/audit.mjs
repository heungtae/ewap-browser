import ts from "typescript";
import { posix } from "node:path";
export const retirementCandidates = [
  "extension/src/service-worker/runtime-chat.ts",
  "extension/src/service-worker/runtime-registration.ts",
  "extension/src/service-worker/act-chat-start.ts",
  "extension/src/service-worker/act-harness-turns.ts",
  "extension/src/offscreen/entry.ts",
  "extension/src/native/native-client.ts",
];
// Static relative TS imports/re-exports only; dynamic/computed/runtime messages
// require separate installed-runtime qualification and are never inferred absent.
export function staticConsumers(sources, candidates) {
  const wanted = new Set(candidates);
  const consumers = Object.fromEntries(candidates.map((path) => [path, []]));
  for (const [path, source] of Object.entries(sources)) {
    const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
    for (const statement of ast.statements) {
      if (
        !ts.isImportDeclaration(statement) &&
        !ts.isExportDeclaration(statement)
      )
        continue;
      const specifier = statement.moduleSpecifier;
      if (
        !specifier ||
        !ts.isStringLiteral(specifier) ||
        !specifier.text.startsWith(".")
      )
        continue;
      const base = posix.normalize(
        posix.join(posix.dirname(path), specifier.text),
      );
      for (const resolved of [
        base,
        base.replace(/\.js$/, ".ts"),
        `${base}.ts`,
        `${base}/index.ts`,
      ]) {
        if (wanted.has(resolved) && !consumers[resolved].includes(path))
          consumers[resolved].push(path);
      }
    }
  }
  return consumers;
}
export function auditRetirement({ manifest, sources, graph, artifacts }) {
  const candidates = retirementCandidates.filter((path) => path in sources);
  const consumers = staticConsumers(sources, candidates);
  const retained = candidates.map((path) => ({
    path,
    consumers: consumers[path].sort(),
    workerReachable: graph.includes(path),
  }));
  const blockers = [];
  if (manifest.background?.service_worker === "src/service-worker/entry.js")
    blockers.push("LEGACY_PRODUCTION_ENTRYPOINT");
  if (retained.length) blockers.push("LEGACY_RETIREMENT_CANDIDATES_PRESENT");
  if (manifest.permissions?.includes("offscreen"))
    blockers.push("OFFSCREEN_PERMISSION_PRESENT");
  if (!artifacts.length || artifacts.some((artifact) => artifact.missing))
    blockers.push("NO_BUILT_ARTIFACT_EVIDENCE");
  // This inventory is insufficient to certify S36, installed ownership, UI,
  // delivery or rollback even when every static legacy finding disappears.
  blockers.push("S36_RELEASE_QUALIFICATION_NOT_ESTABLISHED_BY_STATIC_AUDIT");
  return {
    schema: "wca.retirement-audit/v1",
    result: "BLOCKED",
    blockers,
    workerModules: graph.length,
    retained,
    artifacts,
    limits: [
      "static relative imports only",
      "no installed runtime or delivery checks",
      "no cutover authority",
    ],
  };
}
