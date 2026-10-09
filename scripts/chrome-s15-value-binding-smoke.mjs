import { spawn } from "node:child_process";

const child = spawn(
  process.execPath,
  ["--experimental-websocket", "scripts/chrome-accessible-items-smoke.mjs"],
  {
    stdio: "inherit",
    env: { ...process.env, S15_SUITE: "1" },
  },
);
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
