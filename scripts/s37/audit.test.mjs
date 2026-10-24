import { test } from "node:test";
import assert from "node:assert/strict";
import { auditRetirement, staticConsumers } from "./audit.mjs";
test("AST inventory handles imports and re-exports without comment/string false callers", () => {
  assert.deepEqual(
    staticConsumers(
      {
        "extension/src/a.ts":
          'import x from "./native/native-client.js"; export {y} from "./native/native-client";',
        "extension/src/b.ts":
          '// import x from "./native/native-client.js";\nconst x = "./native/native-client.js";',
      },
      ["extension/src/native/native-client.ts"],
    ),
    {
      "extension/src/native/native-client.ts": ["extension/src/a.ts"],
    },
  );
});
test("retained runtime, offscreen and missing artifacts block retirement", () => {
  const report = auditRetirement({
    manifest: {
      background: { service_worker: "src/service-worker/entry.js" },
      permissions: ["offscreen"],
    },
    sources: { "extension/src/native/native-client.ts": "" },
    graph: ["extension/src/native/native-client.ts"],
    artifacts: [],
  });
  assert.equal(report.result, "BLOCKED");
  assert.equal(report.retained[0].workerReachable, true);
  assert.equal(report.blockers.length, 5);
});
test("empty static findings never qualify runtime, delivery or S36", () => {
  const report = auditRetirement({
    manifest: {},
    sources: {},
    graph: [],
    artifacts: [{ path: "candidate", digest: "a".repeat(64) }],
  });
  assert.equal(report.result, "BLOCKED");
  assert.deepEqual(report.blockers, [
    "S36_RELEASE_QUALIFICATION_NOT_ESTABLISHED_BY_STATIC_AUDIT",
  ]);
});
test("one existing artifact cannot mask a missing declared worker", () => {
  const report = auditRetirement({
    manifest: {},
    sources: {},
    graph: [],
    artifacts: [
      { path: "manifest", digest: "a".repeat(64) },
      { path: "worker", missing: true },
    ],
  });
  assert.ok(report.blockers.includes("NO_BUILT_ARTIFACT_EVIDENCE"));
});
