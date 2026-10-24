import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { build } from "esbuild";
import { git } from "../s26-inventory.mjs";
import { reservePort, waitFor, cdp, evaluate } from "../chrome-cdp-utils.mjs";
const executable = process.env.CHROME_FOR_TESTING_BIN;
if (!executable) throw new Error("CHROME_FOR_TESTING_BIN required");
const fixture = createServer((_req, res) => {
  res.setHeader("content-type", "text/html");
  res.end(
    "<!doctype html><html><head><title>S36MG03 fixture</title></head><body></body></html>",
  );
});
await new Promise((r) => fixture.listen(0, "127.0.0.1", r));
const address = fixture.address();
assert.ok(address && typeof address !== "string");
const profile = await mkdtemp(`${tmpdir()}/s36-mg03-chrome-`);
const port = await reservePort();
const child = spawn(
  executable,
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    `http://127.0.0.1:${address.port}/`,
  ],
  { stdio: "ignore" },
);
const closed = new Promise((r) => child.once("close", r));
const deadline = setTimeout(() => child.kill("SIGKILL"), 50000);
try {
  const target = await waitFor(
    async () => {
      try {
        return (
          await fetch(`http://127.0.0.1:${port}/json/list`).then((r) =>
            r.json(),
          )
        ).find(
          (t) => t.type === "page" && t.url.startsWith("http://127.0.0.1"),
        );
      } catch {
        return undefined;
      }
    },
    10000,
    "CHROME_READY",
  );
  const bundle = await build({
    entryPoints: ["extension/tests/fixture/s36/mg03-chrome-cases.ts"],
    bundle: true,
    platform: "browser",
    format: "iife",
    globalName: "S36MG03",
    write: false,
  });
  await evaluate(target, bundle.outputFiles[0].text);
  const report = await evaluate(
    target,
    "S36MG03.runCases().then(result=>({result:'PASS',...result})).catch(error=>({result:'FAIL',error:error.stack}))",
  );
  const browser = await fetch(`http://127.0.0.1:${port}/json/version`).then(
    (r) => r.json(),
  );
  const output = "docs/evidence/s36-mg03-chrome-2026-10-24";
  await mkdir(output, { recursive: true });
  await writeFile(
    `${output}/report.json`,
    JSON.stringify(
      {
        revision: git("rev-parse", "HEAD").trim(),
        worktreeDirty: Boolean(git("status", "--porcelain").trim()),
        browser: browser.Browser,
        ...report,
      },
      null,
      2,
    ) + "\n",
  );
  assert.equal(report.result, "PASS", report.error);
  console.log(JSON.stringify({ browser: browser.Browser, ...report }));
  await cdp(target.webSocketDebuggerUrl, "Page.stopLoading");
} finally {
  clearTimeout(deadline);
  child.kill("SIGTERM");
  await closed;
  await new Promise((r) => fixture.close(r));
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
