import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { fixture } from "./fixture.mjs";
const sha = (s) => createHash("sha256").update(s).digest("hex");
const results = [];
for (const name of ["codex", "claude"]) {
  const f = await fixture();
  const gateway = resolve("dist/s35/gateway.mjs");
  const prompt =
    'Using only the contextpilot MCP tools, call agent.execute_request with {"requestId":"cli-check","profileId":"profile","tabId":1,"mode":"act","origin":"https://fixture.test","objective":"Controlled no-dispatch fixture request"}. Then call agent.get_status with the returned taskHandle, then agent.cancel with that taskHandle. Do not use shell, read files, delegate or change files. The backend is a controlled fixture and does not run real JEV; report the final cancellation phase without claiming goal completion.';
  const config = resolve(f.directory, "mcp.json");
  await writeFile(
    config,
    JSON.stringify({
      mcpServers: {
        contextpilot: {
          command: process.execPath,
          args: [gateway],
          env: { CONTEXTPILOT_MCP_PAIRING: f.configPath },
        },
      },
    }),
    { mode: 0o600 },
  );
  const toml = `mcp_servers.contextpilot={command=${JSON.stringify(process.execPath)},args=[${JSON.stringify(gateway)}],env={CONTEXTPILOT_MCP_PAIRING=${JSON.stringify(f.configPath)}},enabled_tools=["agent.execute_request","agent.get_status","agent.cancel"],startup_timeout_sec=10,tool_timeout_sec=20}`;
  const args =
    name === "codex"
      ? [
          "exec",
          "--ignore-user-config",
          "--ephemeral",
          "--skip-git-repo-check",
          "--sandbox",
          "read-only",
          "--json",
          "-c",
          'approval_policy="never"',
          "-c",
          toml,
          "--cd",
          f.directory,
          prompt,
        ]
      : [
          "--print",
          "--no-session-persistence",
          "--setting-sources",
          "",
          "--tools",
          "",
          "--strict-mcp-config",
          "--mcp-config",
          config,
          "--permission-mode",
          "dontAsk",
          "--allowedTools",
          "mcp__contextpilot__agent.execute_request,mcp__contextpilot__agent.get_status,mcp__contextpilot__agent.cancel",
          "--output-format",
          "stream-json",
          "--verbose",
          prompt,
        ];
  let stdout = "",
    stderr = "",
    timedOut = false;
  const started = Date.now();
  try {
    const child = spawn(name, args, {
      cwd: f.directory,
      env: process.env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {}
    }, 45000);
    const capture = (chunk, old) =>
      old.length < 1048576 ? old + chunk.toString() : old;
    child.stdout.on("data", (chunk) => {
      stdout = capture(chunk, stdout);
    });
    child.stderr.on("data", (chunk) => {
      stderr = capture(chunk, stderr);
    });
    const exitCode = await new Promise((resolve) => {
      child.once("error", () => resolve(-1));
      child.once("exit", (code) => resolve(code ?? -1));
    });
    clearTimeout(timer);
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
    const calls = f.events.filter((e) => e.kind === "call");
    const expected = [
      "agent.execute_request",
      "agent.get_status",
      "agent.cancel",
    ];
    const passed =
      !timedOut &&
      exitCode === 0 &&
      expected.every((n, i) => calls[i]?.name === n) &&
      calls[2]?.phase === "cancelled" &&
      f.counters.dispatches === 0;
    const firstFailure = passed
      ? null
      : timedOut
        ? "CLIENT_TIMEOUT"
        : /not logged|authentication|unauthorized|invalid.*key|login|401|402/i.test(
              stdout + stderr,
            )
          ? "CLIENT_AUTH_OR_PROVIDER_UNAVAILABLE"
          : "CLIENT_SEMANTIC_QUALIFICATION_FAILED";
    results.push({
      client: name,
      passed,
      exitCode,
      timedOut,
      firstFailure,
      elapsedMs: Date.now() - started,
      catalogCalls: f.events.filter((e) => e.kind === "catalog").length,
      calls,
      dispatches: f.counters.dispatches,
      approvals: f.counters.approvals,
      outputDigest: sha(stdout + stderr),
      scope:
        "Real CLI/model against controlled local backend; no actual JEV, Chrome or product UI qualification",
    });
    console.log(JSON.stringify(results.at(-1)));
  } finally {
    await f.close();
  }
}
const report = {
  schema: "s35-real-clients/v1",
  at: new Date().toISOString(),
  result: results.every((r) => r.passed) ? "PASS" : "UNVERIFIED",
  results,
};
await writeFile(
  process.env.S35_REPORT ?? "/tmp/s35-real-clients.json",
  JSON.stringify(report, null, 2) + "\n",
);
