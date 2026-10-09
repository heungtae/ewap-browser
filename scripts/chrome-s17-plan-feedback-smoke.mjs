import { spawn } from "node:child_process";
const child = spawn(
  process.execPath,
  ["--experimental-websocket", "scripts/chrome-accessible-items-smoke.mjs"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      S15_SUITE: "1",
      S17_SUITE: "1",
      S15_LIVE_MODEL: process.env.S17_LIVE_MODEL ?? "",
      ACCESSIBLE_ITEMS_CASES:
        process.env.ACCESSIBLE_ITEMS_CASES ??
        "search,multiple,deny,controls-link,states-link,preview,document-link,async-preview",
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
