import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createS1Fixture } from "./chrome-s1-fixture.mjs";
import { openS19Chrome } from "./chrome-s19-harness.mjs";
import { configureS22Settings } from "./chrome-s22-settings.mjs";
import { cdp, evaluate, waitFor } from "./chrome-cdp-utils.mjs";
import { s24ActProvider } from "./chrome-s24-act-provider.mjs";
const cert = await mkdtemp(join(tmpdir(), "contextpilot-s24-act-cert-"));
const turns = [];
let harness;
const fixture = await createS1Fixture(
  cert,
  '<!doctype html><main aria-label="Search form"><h1>Search</h1><label for="query">Search terms</label><input id="query" /></main>',
  async (_req, res, body) => {
    const message = s24ActProvider(body, turns.length + 1);
    const inventory = body.messages.findLast((m) =>
      m.content?.startsWith("[UNTRUSTED_EXECUTION_INVENTORY]"),
    );
    turns.push({
      offered: body.tools?.map((t) => t.function.name) ?? [],
      returned: message.tool_calls?.map((c) => c.function.name) ?? [],
      receipts: inventory
        ? JSON.parse(inventory.content.split("\n")[1]).execution_evidence?.map(
            (e) => ({
              raw_outcome: e.raw_outcome,
              outcome: e.outcome,
              dispatch: e.dispatch,
            }),
          )
        : [],
    });
    res.writeHead(200, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    });
    res.end(
      JSON.stringify({
        id: "s24-act",
        choices: [
          {
            message,
            finish_reason: message.tool_calls ? "tool_calls" : "stop",
          },
        ],
      }),
    );
  },
);
try {
  harness = await openS19Chrome({
    executable: process.env.CHROME_FOR_TESTING_BIN,
    fixture,
  });
  await configureS22Settings(harness, "full");
  const run = async (value) => {
    await cdp(harness.version.webSocketDebuggerUrl, "Target.activateTarget", {
      targetId: harness.fixtureTarget.targetId,
    });
    await evaluate(
      harness.panel,
      `(()=>{document.querySelector('#mode-act').click();document.querySelector('#chat-input').value=${JSON.stringify(`Enter ${value} into Search terms.`)};document.querySelector('#chat-form').requestSubmit();return true})()`,
    );
    await waitFor(
      () =>
        evaluate(
          harness.page,
          `document.querySelector('#query').value===${JSON.stringify(value)}`,
        ),
      25000,
      "CURRENT_INPUT_ENTERED",
    );
    await waitFor(
      () =>
        evaluate(
          harness.panel,
          "document.querySelector('#chat-send').dataset.state==='send'",
        ),
      25000,
      "ACT_TERMINAL",
    );
  };
  await run("alpha-current");
  const catalog = () =>
    evaluate(
      harness.panel,
      "chrome.storage.local.get('learned_page_profiles_v1').then(v=>v.learned_page_profiles_v1)",
    );
  const first = await waitFor(
    async () => {
      const c = await catalog();
      return c?.records?.length ? c : undefined;
    },
    10000,
    "ACT_PROFILE_SAVED",
  );
  assert.equal(first.records[0].commands[0].backend, "ui_recipe");
  const firstTurns = turns.length;
  await run("beta-current");
  const second = await waitFor(
    async () => {
      const c = await catalog();
      return c?.records?.[0]?.recipes?.[0]?.revision === 2 ? c : undefined;
    },
    10000,
    "ACT_PROFILE_REUSED",
  );
  assert.equal(
    second.records[0].commands[0].command_id,
    first.records[0].commands[0].command_id,
  );
  assert.ok(
    turns
      .slice(firstTurns)
      .some((t) => t.returned.some((n) => n.startsWith("page_cmd_"))),
  );
  assert.ok(
    turns.slice(firstTurns).some((t) => t.returned.includes("submit_plan")),
  );
  assert.equal(JSON.stringify(second).includes("alpha-current"), false);
  assert.equal(JSON.stringify(second).includes("beta-current"), false);
  await writeFile(
    process.env.S24_ACT_REPORT ?? "/tmp/s24-act.json",
    JSON.stringify(
      {
        scope: "controlled_chrome_act",
        checks: [
          "eligible_verified_act_save",
          "ui_command_proposed_only",
          "fresh_submit_plan",
          "fresh_current_input",
          "normal_approval_path",
          "atomic_command_revision",
          "no_persistent_input_values",
        ],
        turns,
      },
      null,
      2,
    ),
  );
  console.log("S24 Act Chrome fixture passed.");
} catch (error) {
  await writeFile(
    process.env.S24_ACT_REPORT ?? "/tmp/s24-act-failed.json",
    JSON.stringify({ result: "FAIL", reason: error.message, turns }, null, 2),
  );
  throw error;
} finally {
  await harness?.close();
  await new Promise((resolve) => fixture.fixture.close(resolve));
  await rm(cert, { recursive: true, force: true });
}
