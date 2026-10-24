import { readFileSync, mkdirSync } from "node:fs";
import { build } from "esbuild";
import { files, read, digest, git } from "../s26-inventory.mjs";
import { auditRetirement } from "./audit.mjs";
const sources = Object.fromEntries(
  files()
    .filter((path) => path.startsWith("extension/src/") && path.endsWith(".ts"))
    .map((path) => [path, readFileSync(path, "utf8")]),
);
const bundle = await build({
  entryPoints: ["extension/src/service-worker/entry.ts"],
  bundle: true,
  write: false,
  metafile: true,
  platform: "browser",
  format: "esm",
  target: "chrome116",
});
const builtManifest = read("dist-extension/manifest.json");
const worker = builtManifest.background?.service_worker;
if (
  typeof worker !== "string" ||
  worker.includes("..") ||
  worker.startsWith("/")
)
  throw new Error("INVALID_BUILT_WORKER_PATH");
const artifacts = [
  "dist-extension/manifest.json",
  `dist-extension/${worker}`,
].map((path) => {
  try {
    return { path, digest: digest(readFileSync(path)) };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { path, missing: true };
  }
});
const report = {
  revision: git("rev-parse", "HEAD").trim(),
  worktreeDirty: Boolean(git("status", "--porcelain").trim()),
  ...auditRetirement({
    manifest: read("extension/manifest.json"),
    sources,
    graph: Object.keys(bundle.metafile.inputs),
    artifacts,
  }),
};
mkdirSync("dist/s37", { recursive: true });
const { writeFileSync } = await import("node:fs");
writeFileSync(
  "dist/s37/retirement-audit.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    result: report.result,
    blockers: report.blockers,
    workerModules: report.workerModules,
    candidates: report.retained.length,
    report: "dist/s37/retirement-audit.json",
  }),
);
process.exitCode = 2;
