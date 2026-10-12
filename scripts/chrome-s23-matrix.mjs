import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
const cases = (
  process.env.S23_CASES ??
  "full,ask,ask-mode,source-deny,action-deny,risk-deny,return-deny,throw,timeout,stop,navigation,replacement,repeat,secret,holdout,disabled,ui,plan"
).split(",");
const results = [];
for (const name of cases) {
  const path = join(tmpdir(), `s23-matrix-${name}.json`);
  const variant = ["secret", "holdout", "ui"].includes(name) ? name : "base";
  const code = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--experimental-websocket", "scripts/chrome-s23-page-method-smoke.mjs"],
      {
        stdio: ["ignore", "ignore", "inherit"],
        env: {
          ...process.env,
          S23_CASE: variant === "base" ? name : "full",
          S23_VARIANT: variant,
          S23_REPORT: path,
          S23_LIVE_MODEL: "",
        },
      },
    );
    child.once("error", reject);
    child.once("exit", resolve);
  });
  let report;
  try {
    report = JSON.parse(await readFile(path, "utf8"));
  } catch {
    report = [{ pass: false, error: "REPORT_UNAVAILABLE" }];
  }
  const pass = code === 0 && report.every((item) => item.pass);
  results.push({ name, pass, report });
  console.log(`S23 ${name}: ${pass ? "PASS" : "FAIL"}`);
}
await writeFile(
  process.env.S23_MATRIX_REPORT ?? "/tmp/s23-matrix.json",
  JSON.stringify(results, null, 2),
);
if (results.some((item) => !item.pass)) process.exitCode = 1;
