import { checkS25Settings } from "./chrome-s25-settings.mjs";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createS1Fixture } from "./chrome-s1-fixture.mjs";
import { openS19Chrome } from "./chrome-s19-harness.mjs";
import { configureS22Settings } from "./chrome-s22-settings.mjs";
import {
  createS25DecisionFixture,
  s25PrimaryFixture,
} from "./chrome-s25-fixture.mjs";
import { evaluate, waitFor, sleep } from "./chrome-cdp-utils.mjs";
const cert = await mkdtemp(join(tmpdir(), "contextpilot-s25-"));
const primaryCalls = [],
  checks = [];
let harness, decision, fixture;
const reportPath = process.env.S25_REPORT ?? "/tmp/s25-chrome.json";
try {
  fixture = await createS1Fixture(
    cert,
    `<!doctype html><main><h1>S25 Save page</h1><button onclick="window.dispatches=(window.dispatches||0)+1;document.querySelector('#result').textContent='Saved'">Save</button><p id="result">Ready</p><input type="password" value="S25_SECRET_PASSWORD"></main>`,
    s25PrimaryFixture(primaryCalls),
  );
  decision = await createS25DecisionFixture(cert);
  harness = await openS19Chrome({
    executable: process.env.CHROME_FOR_TESTING_BIN,
    fixture,
    hostRules: "MAP jev.fixture.test 127.0.0.1",
  });
  const run = async (prompt, act = false) => {
    await evaluate(
      harness.panel,
      `(()=>{document.querySelector(${JSON.stringify(act ? "#mode-act" : "#mode-ask")}).click();document.querySelector('#chat-input').value=${JSON.stringify(prompt)};document.querySelector('#chat-form').requestSubmit();return true})()`,
    );
    await sleep(150);
    await waitFor(
      () =>
        evaluate(
          harness.panel,
          "document.querySelector('#chat-send').dataset.state==='send'",
        ),
      25000,
      "S25_SETTLEMENT",
    );
    return evaluate(harness.panel, "document.body.innerText");
  };
  await run("single: Explain the visible page.");
  assert.equal(decision.calls.length, 0);
  assert.ok(primaryCalls.length >= 2);
  checks.push("primary-only no native contact");
  await configureS22Settings(harness, "full");
  assert.equal(
    (
      await harness.send({
        kind: "PROVIDER_SAVE",
        payload: {
          id: "jev",
          config: {
            kind: "typesafe_jev",
            plugin_id: "contextpilot.typesafe-jev",
            plugin_version: "1.0.0",
            label: "Jev fixture",
            base_url: `https://jev.fixture.test:${decision.port}/v1`,
            model: "jev-1.13.0",
            wire_api: "chat_completions",
            api_key: "s25-fixture-key",
            api_key_header: "authorization_bearer",
            headers: [],
            timeout_ms: 5000,
            enabled: true,
          },
        },
      })
    ).ok,
    true,
  );
  const routing = async (mode) => {
    const state = await harness.send({ kind: "PROVIDER_LIST" });
    assert.equal(
      (
        await harness.send({
          kind: "PROVIDER_SET_ROUTING",
          payload: {
            revision: state.revision,
            routing: {
              mode,
              decision_provider: "jev",
              pre_dispatch_failure: "primary",
            },
          },
        })
      ).ok,
      true,
    );
  };
  await routing("jev");
  assert.equal(
    (await harness.send({ kind: "PROVIDER_TEST", payload: { id: "jev" } })).ok,
    true,
  );
  const beforeFinite = primaryCalls.length;
  assert.ok(
    (
      await run(
        "finite-yes: Is the Save button visible? Answer only yes or no.",
      )
    ).includes("현재 제공된 자료에서는 그렇습니다."),
  );
  assert.equal(primaryCalls.length, beforeFinite);
  checks.push("native finite Ask; no primary call");
  const beforeTools = primaryCalls.length;
  const answered = await run("dual: Explain the visible page.");
  assert.ok(answered.includes("S25 prepared answer:"));
  const turns = primaryCalls.slice(beforeTools),
    id = turns[0].call_ids[0];
  assert.equal(turns[0].returned_tools[0], "get_page_text");
  assert.ok(turns[1].returned_ids.includes(id));
  assert.ok(decision.calls.some((c) => c.phase === "result_acceptance"));
  checks.push("real primary tool ID continuation and native result selection");
  const acted = await run(
    "Click Save once and confirm that Saved appears.",
    true,
  );
  assert.equal(await evaluate(harness.page, "window.dispatches"), 1);
  assert.ok(acted.includes("요청한 목표의 완료를 확인했습니다."));
  assert.ok(decision.calls.some((c) => c.phase === "intent"));
  assert.ok(decision.calls.some((c) => c.phase === "goal_assessment"));
  checks.push("Act native intent/goal with one approved dispatch");
  decision.mode.fail = true;
  const failed = await run("fallback: Explain the visible page.");
  assert.ok(failed.includes("S25 prepared answer:"));
  assert.ok(!failed.includes("S25_SECRET_PASSWORD"));
  checks.push(
    "configured 503 fallback preserves primary outcome and masks rejected input",
  );
  decision.mode.fail = false;
  await routing("single");
  const beforeOff = decision.calls.length;
  await run("off: Explain the visible page.");
  assert.equal(decision.calls.length, beforeOff);
  checks.push("routing off has zero native calls");
  await checkS25Settings(harness, checks);
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        result: "PASS",
        scope: "controlled fixtures; no live model qualification",
        checks,
        primary_turns: primaryCalls,
        native_calls: decision.calls,
      },
      null,
      2,
    ),
  );
  console.log(`S25 controlled Chrome passed (${checks.length} checks).`);
} catch (error) {
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        result: "FAIL",
        reason: error.message,
        checks,
        primary_turns: primaryCalls,
        native_calls: decision?.calls,
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await harness?.close();
  await decision?.close();
  if (fixture) await new Promise((resolve) => fixture.fixture.close(resolve));
  await rm(cert, { recursive: true, force: true });
}
