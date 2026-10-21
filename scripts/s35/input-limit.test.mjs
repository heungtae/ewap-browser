import { spawn } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixture.mjs";
test("S35 oversized stdio input closes the gateway before any tool admission", async () => {
  const f = await fixture();
  let child;
  try {
    child = spawn(process.execPath, ["dist/s35/gateway.mjs"], {
      env: { CONTEXTPILOT_MCP_PAIRING: f.configPath },
      stdio: ["pipe", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (data) => {
      stderr += data;
    });
    child.stdin.on("error", () => {});
    child.stdin.write("x".repeat(262145) + "\n");
    const timeout = setTimeout(() => child.kill(), 5000);
    const code = await new Promise((resolve) => child.once("exit", resolve));
    clearTimeout(timeout);
    assert.equal(code, 1);
    assert.match(stderr, /MCP_INPUT_LIMIT/);
    assert.equal(f.events.length, 0);
    assert.equal(f.counters.dispatches, 0);
  } finally {
    child?.kill();
    await f.close();
  }
});
