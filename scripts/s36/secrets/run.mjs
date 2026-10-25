import { spawn, execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
if (Number(process.versions.node.split(".")[0]) < 22)
  throw new Error("NODE_22_REQUIRED");
const child = spawn(
  "/usr/bin/dbus-run-session",
  [
    "--",
    process.execPath,
    "--test",
    resolve("scripts/s36/secrets/os.test.mjs"),
  ],
  {
    detached: true,
    env: { ...process.env, S36_PRIVATE_SECRET_BUS: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let log = "";
child.stdout.on("data", (data) => {
  log += data;
  process.stdout.write(data);
});
child.stderr.on("data", (data) => {
  log += data;
  process.stderr.write(data);
});
let timedOut = false;
const deadline = setTimeout(() => {
  timedOut = true;
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    /* Already exited. */
  }
}, 55000);
const code = await new Promise((r) => child.once("close", r));
clearTimeout(deadline);
if (process.env.S36_SECRET_EVIDENCE_DIR) {
  await mkdir(process.env.S36_SECRET_EVIDENCE_DIR, { recursive: true });
  await writeFile(`${process.env.S36_SECRET_EVIDENCE_DIR}/tests.tap`, log);
  const report = {
    result: code === 0 && !timedOut ? "PASS" : "FAIL",
    privateDbus: true,
    node: process.versions.node,
    platform: process.platform,
    revision: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    worktreeDirty: Boolean(
      execFileSync("git", ["status", "--porcelain"], {
        encoding: "utf8",
      }).trim(),
    ),
    keyring: execFileSync("/usr/bin/gnome-keyring-daemon", ["--version"], {
      encoding: "utf8",
    }).trim(),
    tests: Number(log.match(/^# tests (\d+)/m)?.[1] ?? 0),
    passed: Number(log.match(/^# pass (\d+)/m)?.[1] ?? 0),
    scope:
      "isolated GNOME Secret Service persistence/lock and controlled MG01 readback; no user keyring or default-store migration",
  };
  await writeFile(
    `${process.env.S36_SECRET_EVIDENCE_DIR}/report.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
}
process.exitCode = code === 0 && !timedOut ? 0 : 1;
