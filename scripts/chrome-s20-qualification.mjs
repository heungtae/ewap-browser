import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
const directory = resolve(
  process.env.S20_REPORT_DIR ?? "/tmp/contextpilot-s20",
);
await mkdir(directory, { recursive: true });
const definitions = [
  ["api", "chrome-s20-api-smoke.mjs", "S20_API_REPORT", {}],
  ["fault", "chrome-s20-fault-smoke.mjs", "S20_FAULT_REPORT", {}],
  ["mixed", "chrome-s20-mixed-smoke.mjs", "S20_REPORT", {}],
  [
    "input",
    "chrome-s15-value-binding-smoke.mjs",
    "ACCESSIBLE_ITEMS_REPORT",
    { S15_INPUT_CLARIFICATION_CASE: "1" },
  ],
  ["source", "chrome-s16-script-tools-smoke.mjs", "S16_REPORT", {}],
  ["plan", "chrome-s17-plan-feedback-smoke.mjs", "ACCESSIBLE_ITEMS_REPORT", {}],
  [
    "workflow",
    "chrome-s18-workflow-tools-smoke.mjs",
    "ACCESSIBLE_ITEMS_REPORT",
    {},
  ],
  ["component", "chrome-s19-component-tools-smoke.mjs", "S19_REPORT", {}],
  ["ask", "chrome-s3-smoke.mjs", undefined, {}],
];
const selected =
  process.env.S20_GROUPS?.split(",") ?? definitions.map(([id]) => id);
if (selected.some((id) => !definitions.some(([name]) => name === id)))
  throw Error("Unknown S20 group");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sourceHashes = {};
for (const file of (await readdir("scripts")).filter((f) =>
  /^chrome-s20.*\.mjs$/.test(f),
))
  sourceHashes[file] = sha(await readFile(join("scripts", file)));
const manifest = {
  harness_hashes: sourceHashes,
  worktree_diff_hash: sha(execFileSync("git", ["diff", "HEAD"])),
  build_hash: sha(await readFile("dist-extension/js/service-worker.js")),
  revision: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  version: JSON.parse(await readFile("package.json", "utf8")).version,
  node: process.version,
  started: new Date().toISOString(),
  groups: [],
};
for (const [id, script, reportKey, extra] of definitions.filter(([id]) =>
  selected.includes(id),
)) {
  const started = Date.now();
  const logPath = join(directory, `${id}.log`);
  const log = createWriteStream(logPath, { flags: "wx" });
  await new Promise((resolve, reject) => {
    log.once("open", resolve);
    log.once("error", reject);
  });
  const reportPath = join(directory, `${id}.json`);
  const child = spawn(
    process.execPath,
    ["--experimental-websocket", `scripts/${script}`],
    {
      env: {
        ...process.env,
        ...extra,
        ...(reportKey ? { [reportKey]: reportPath } : {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  const outcome = await new Promise((resolve) => {
    child.once("error", (error) => resolve({ code: null, error: error.code }));
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  await new Promise((resolve) => log.end(resolve));
  const artifacts = [];
  for (const path of [logPath, ...(reportKey ? [reportPath] : [])]) {
    try {
      const bytes = await readFile(path);
      artifacts.push({
        file: path,
        sha256: sha(bytes),
        bytes: bytes.length,
      });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  manifest.groups.push({
    id,
    script,
    ...outcome,
    elapsed_ms: Date.now() - started,
    artifacts,
  });
  await writeFile(
    join(directory, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  console.log(`S20 ${id}: ${outcome.code === 0 ? "PASS" : "FAIL"}`);
}
if (manifest.groups.some((g) => g.code !== 0)) process.exitCode = 1;
