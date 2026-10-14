import { verifyS24Options } from "./chrome-s24-options.mjs";
import assert from "node:assert/strict";
import { cdp, evaluate, waitFor } from "./chrome-cdp-utils.mjs";
export async function verifyS24Chrome(harness, run, evidence) {
  let settings;
  const extensionId = new URL(harness.panel.url).host;
  const target = await cdp(
    harness.version.webSocketDebuggerUrl,
    "Target.createTarget",
    { url: `chrome-extension://${extensionId}/settings/index.html` },
  );
  const port = new URL(harness.version.webSocketDebuggerUrl).port;
  settings = await waitFor(
    async () =>
      (
        await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json())
      ).find((t) => t.id === target.targetId),
    10000,
    "SETTINGS_READY",
  );
  const send = (message) =>
    evaluate(
      settings,
      `chrome.runtime.sendMessage(${JSON.stringify({ kind: "LEARNED_PROFILE_MANAGE", ...message })})`,
    );
  const first = await waitFor(
    async () => {
      const c = await send({ operation: "list" });
      return c?.records?.length ? c : undefined;
    },
    10000,
    "PROFILE_SAVED",
  );
  assert.equal(first.records.length, 1);
  assert.equal(first.records[0].commands.length, 1);
  const stored = await evaluate(
    settings,
    "chrome.storage.local.get('learned_page_profiles_v1')",
  );
  assert.equal(JSON.stringify(stored).includes("alice"), false);
  assert.equal(JSON.stringify(stored).includes("private-account"), false);
  const unauthorized = await harness.send({
    kind: "LEARNED_PROFILE_MANAGE",
    operation: "clear",
    revision: first.catalog_revision,
  });
  assert.equal(unauthorized.ok, false);
  assert.equal(unauthorized.code, "POLICY_DENIED");
  await cdp(harness.version.webSocketDebuggerUrl, "Target.activateTarget", {
    targetId: harness.fixtureTarget.targetId,
  });
  const beforeCalls = evidence.length;
  await run(
    process.env.S24_LIVE_MODEL
      ? "second-page-help: Use the available learned page help command tool to read the current page and explain it. Execute this read-only command normally with dry_run false, rather than inspecting its metadata. Do not change the page."
      : "second-page-help: Explain this page again.",
  );
  await waitFor(
    async () => evidence.length >= beforeCalls + 2,
    20000,
    "COMMAND_CONTINUATION",
  );
  assert.ok(
    evidence.slice(beforeCalls).some((r) => r.tools.includes("page_cmd_0")),
  );
  assert.ok(evidence.slice(beforeCalls).some((r) => r.tool_call_ids.length));
  const second = await waitFor(
    async () => {
      const c = await send({ operation: "list" });
      return c?.records?.[0]?.recipes?.[0]?.revision === 2 ? c : undefined;
    },
    10000,
    "PROFILE_REUSED",
  );
  assert.equal(second.records[0].commands[0].recipe_revision, 2);
  const commandTurn = evidence
    .slice(beforeCalls)
    .find((r) =>
      r.returned_tools?.some((name) => name.startsWith("page_cmd_")),
    );
  assert.ok(commandTurn, "actual generated command consumption");
  assert.ok(
    commandTurn.returned_ids.some((id) =>
      evidence.slice(beforeCalls).some((r) => r.tool_call_ids.includes(id)),
    ),
    "same command tool_call_id continuation",
  );
  const commandResults = evidence
    .slice(beforeCalls)
    .filter((r) =>
      r.tool_call_ids.some((id) => commandTurn.returned_ids.includes(id)),
    );
  assert.ok(
    commandResults.some((r) =>
      r.statuses.some(
        (s) =>
          commandTurn.returned_ids.includes(s.tool_call_id) &&
          s.status === "AVAILABLE" &&
          s.dry_run !== true,
      ),
    ),
    "command normal read result",
  );
  await verifyS24Options({ settings, send, harness, run, evidence, second });
}
