import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import {
  files,
  read,
  digest,
  validateInventory,
} from "../../s26-inventory.mjs";
const manifest = read("docs/baselines/s36-transport/disposition.json");
for (const entry of read("docs/baselines/s36-presentation/disposition.json")
  .files)
  assert.deepEqual(
    manifest.files.find((item) => item.path === entry.path),
    entry,
  );
for (const [path, expected] of Object.entries(
  read("docs/baselines/s27/entry.json").preservedSourceHashes,
))
  assert.equal(digest(readFileSync(path)), expected, path);
const sources = files().filter(
  (path) =>
    /\.(ts|mjs)$/.test(path) &&
    /^(apps\/agent-server\/src\/(migration|ipc)\/|packages\/(policy-engine|shared)\/src\/(migration|release-set)|apps\/chrome-extension\/src\/(migration|presentation|bridge)\/|extension\/tests\/(unit\/migration|fixture)\/s36\/|scripts\/s36\/(mg0[123456]|integration\/|release\/|install\/|presentation\/|transport\/))/.test(
      path,
    ),
);
for (const path of sources)
  assert.ok(
    readFileSync(path, "utf8").trimEnd().split("\n").length <= 199,
    path,
  );
const output = await build({
  entryPoints: [
    "apps/chrome-extension/src/migration/owner.ts",
    "apps/chrome-extension/src/presentation/entry.ts",
    "apps/chrome-extension/src/bridge/worker.ts",
    "apps/chrome-extension/src/migration/rpc.ts",
    "apps/chrome-extension/src/migration/mg02-staging.ts",
    "packages/policy-engine/src/migration-evaluate.ts",
    "apps/chrome-extension/src/migration/coordinator-staging.ts",
    "apps/chrome-extension/src/migration/mg06-staging.ts",
    "apps/chrome-extension/src/migration/mg05-staging.ts",
    "apps/chrome-extension/src/migration/mg05-drain.ts",
    "apps/chrome-extension/src/migration/mg05-lifecycle.ts",
    "apps/chrome-extension/src/migration/mg04-staging.ts",
    "apps/chrome-extension/src/migration/mg03-staging.ts",
  ],
  outdir: "/tmp/s36-mg02-browser-boundary",
  bundle: true,
  write: false,
  platform: "browser",
  metafile: true,
  format: "esm",
});
assert.ok(
  Object.keys(output.metafile.inputs).every(
    (path) =>
      !path.startsWith("apps/agent-server/") &&
      !path.includes("/service-worker/") &&
      !path.includes("/provider-adapters/") &&
      !path.includes("/tool-runtime/"),
  ),
  "no execution/backend imports",
);

const backend = await build({
  entryPoints: [
    "apps/agent-server/src/migration/session.ts",
    "apps/agent-server/src/migration/rpc.ts",
    "apps/agent-server/src/ipc/server.ts",
    "apps/agent-server/src/migration/release-set.ts",
    "apps/agent-server/src/migration/installation.ts",
    "apps/agent-server/src/migration/install-transition.ts",
    "apps/agent-server/src/migration/mg01-settings.ts",
    "apps/agent-server/src/migration/mg02-mirror.ts",
  ],
  outdir: "/tmp/s36-mg02-boundary",
  bundle: true,
  write: false,
  platform: "node",
  metafile: true,
  format: "esm",
});
assert.ok(
  Object.keys(backend.metafile.inputs)
    .filter((path) => path.startsWith("extension/src/"))
    .every((path) =>
      /^extension\/src\/(security\/|settings\/provider-config-validation\.ts$|providers\/(types|provider-request|provider-network-url)\.ts$)/.test(
        path,
      ),
    ),
  "backend retains only pure legacy validators",
);
assert.ok(
  !backend.outputFiles[0].text.includes("PRIVATE_API_CANARY_001"),
  "no fixture credential in backend bundle",
);
console.log(
  JSON.stringify({
    result: "PASS",
    ...validateInventory(manifest),
    modules: sources.length,
    browserBoundary: "PASS",
    backendBoundary: "PASS",
    productionAndDesign: "unchanged",
  }),
);
