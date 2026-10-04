import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { exampleRequests } from "./chrome-example-request-cases.mjs";
const directory = resolve(
  process.env.EXAMPLE_REQUEST_REPORT_DIR ??
    "/tmp/contextpilot-example-requests",
);
await mkdir(directory, { recursive: true });
const inventory = await exampleRequests();
const results = [];
for (const suite of ["accessible", "reading"]) {
  const report = join(directory, `${suite}.json`);
  await rm(report, { force: true });
  const code = await new Promise((done, reject) => {
    const child = spawn(
      process.execPath,
      ["--experimental-websocket", "scripts/chrome-accessible-items-smoke.mjs"],
      {
        stdio: "inherit",
        env: {
          ...process.env,
          EXAMPLE_REQUEST_SUITE: suite,
          ACCESSIBLE_ITEMS_CASES: "",
          ACCESSIBLE_ITEMS_URL: "",
          ACCESSIBLE_ITEMS_TEST_PROFILE: "",
          ACCESSIBLE_ITEMS_REPORT: report,
        },
      },
    );
    child.once("error", reject);
    child.once("close", done);
  });
  let cases;
  try {
    cases = JSON.parse(await readFile(report, "utf8"));
  } catch {
    cases = [];
  }
  results.push({ suite, exit_code: code, cases });
}
const expected = inventory.accessible.length + inventory.reading.length;
const cases = results.flatMap((r) => r.cases);
const summary = {
  expected,
  executed: cases.length,
  passed: cases.filter((c) => c.pass).length,
  provider: "controlled local fixture, not live model validation",
  results,
};
await writeFile(
  join(directory, "summary.json"),
  JSON.stringify(summary, null, 2),
);
console.log(
  `Document requests: ${summary.passed}/${expected} passed; report: ${directory}/summary.json`,
);
if (
  summary.executed !== expected ||
  summary.passed !== expected ||
  results.some((r) => r.exit_code !== 0)
)
  process.exitCode = 1;
