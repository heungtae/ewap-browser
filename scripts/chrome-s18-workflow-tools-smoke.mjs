import { spawn } from "node:child_process";
const child = spawn(
  process.execPath,
  ["--experimental-websocket", "scripts/chrome-accessible-items-smoke.mjs"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      S15_SUITE: "1",
      S18_SUITE: "1",
      S15_LIVE_MODEL: process.env.S18_LIVE_MODEL ?? "",
    },
  },
);
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
