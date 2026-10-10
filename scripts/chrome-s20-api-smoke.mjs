import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { createS1Fixture } from "./chrome-s1-fixture.mjs";
import { openS19Chrome } from "./chrome-s19-harness.mjs";
import { evaluate, sleep } from "./chrome-cdp-utils.mjs";
import { liveProviderConfig } from "./live-provider-config.mjs";
import { s20Provider } from "./chrome-s20-provider.mjs";
import { apiHtml, apiControlled } from "./chrome-s20-api-fixture.mjs";
const model = process.env.S20_LIVE_MODEL,
  live = liveProviderConfig(model);
const current = { id: "registered-api", functionName: "selectVariant", n: 0 };
const prompt =
  "Inspect the page script defining selectVariant without executing source. Then submit a plan for my review to choose High using the registered Page API capability and its supplied option, not arbitrary script execution or a raw UI action. After approval, execute only that registered action, observe the selected value, and report whether the goal is complete.";
current.prompt = prompt;
const cert = await mkdtemp(join(tmpdir(), "contextpilot-s20-api-"));
const calls = [],
  results = [];
const fixture = await createS1Fixture(
  cert,
  apiHtml,
  s20Provider({
    calls,
    current: () => current,
    live,
    model,
    controlled: apiControlled,
  }),
);
const harness = await openS19Chrome({
  executable: process.env.CHROME_FOR_TESTING_BIN,
  fixture,
  liveModel: model,
  pageUrl: "https://page-api-fixture.invalid/variant",
  hostRules: `MAP page-api-fixture.invalid:443 127.0.0.1:${fixture.fixturePort}`,
});
try {
  await evaluate(
    harness.panel,
    `(()=>{document.querySelector('#mode-act').click();document.querySelector('#chat-input').value=${JSON.stringify(prompt)};document.querySelector('#chat-form').requestSubmit();return true})()`,
  );
  const started = Date.now(),
    deadline = started + (model ? 240000 : 90000);
  let finished = false;
  while (Date.now() < deadline) {
    await sleep(150);
    await evaluate(
      harness.panel,
      "(()=>{for(const label of ['일반 한 단계 실행','이번 요청에 허용','계획 승인','이번 단계 실행','이번만 허용','확인하고 실행'])for(const c of [...document.querySelectorAll('.event-card')].filter(c=>c.dataset.testSeen!=='1')){const b=[...c.querySelectorAll('button')].find(b=>!b.disabled&&b.textContent.includes(label));if(b){c.dataset.testSeen='1';b.click();break}}return true})()",
    );
    if (
      calls
        .flatMap((r) => r.response)
        .some((c) => c.name === "report_goal_status") &&
      (await evaluate(
        harness.panel,
        "document.querySelector('#chat-send').dataset.state==='send' && document.querySelector('#chat-messages').textContent.includes('모델이 목표 완료')",
      ))
    ) {
      finished = true;
      break;
    }
    if (
      await evaluate(
        harness.panel,
        "document.querySelector('#chat-send').dataset.state==='send' && document.querySelectorAll('.event-card[data-kind=error]').length>0",
      )
    )
      break;
  }
  assert.ok(finished, "Registered API goal feedback missing");
  const chosen = calls.flatMap((c) => c.response),
    returned = calls.at(-1).returned;
  for (const name of [
    "read_page_resource",
    "submit_plan",
    "propose_page_api",
    "report_goal_status",
  ])
    assert.ok(
      chosen.some((c) => c.name === name),
      `Missing ${name}`,
    );
  assert.ok(returned.some((r) => r.source_read && r.source_rule_observed));
  assert.ok(
    returned.some(
      (r) =>
        r.execution &&
        r.outcome === "VERIFIED" &&
        r.verifier === "satisfied" &&
        r.dispatched,
    ),
  );
  assert.equal(
    chosen.some(
      (c) => c.name === "propose_select_option" || c.name === "propose_click",
    ),
    false,
  );
  assert.equal(await evaluate(harness.page, "window.callCount"), 1);
  assert.equal(
    await evaluate(harness.page, "document.querySelector('select').value"),
    "high",
  );
  results.push({
    id: current.id,
    pass: true,
    provider: model ? live.provider : "controlled",
    model: model ?? "fixture",
    elapsed_ms: Date.now() - started,
    calls,
    api_calls: 1,
    selected: "high",
  });
  console.log("S20 registered API: PASS");
} catch (error) {
  results.push({
    id: current.id,
    pass: false,
    error: String(error),
    ui_errors: await evaluate(
      harness.panel,
      "[...document.querySelectorAll('.event-card[data-kind=error]')].map(c=>c.textContent)",
    ),
    calls,
  });
  process.exitCode = 1;
  console.log(`S20 registered API: FAIL ${error}`);
} finally {
  if (process.env.S20_API_REPORT)
    await writeFile(
      process.env.S20_API_REPORT,
      JSON.stringify(results, null, 2),
    );
  await harness.close();
  await new Promise((resolve) => fixture.fixture.close(resolve));
  await rm(cert, { recursive: true, force: true, maxRetries: 3 });
}
