import { spawn } from "node:child_process";
const child = spawn(
  process.execPath,
  ["--experimental-websocket", "scripts/chrome-s21-smoke.mjs"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      S22_MODE: "full",
      S21_REPORT: process.env.S22_REPORT ?? "/tmp/s22-approval.json",
      S21_LIVE_MODEL: process.env.S22_LIVE_MODEL ?? "",
      S21_CASES:
        process.env.S22_CASES ??
        "generic-click,generic-unchanged,element,normal,delayed,replacement,not-completed,already,blocked",
    },
  },
);
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
