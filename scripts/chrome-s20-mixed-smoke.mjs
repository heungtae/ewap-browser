import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createS1Fixture } from "./chrome-s1-fixture.mjs";
import { openS19Chrome } from "./chrome-s19-harness.mjs";
import { cdp, evaluate, sleep } from "./chrome-cdp-utils.mjs";
import { liveProviderConfig } from "./live-provider-config.mjs";
import { s20Cases, s20Html, s20Prompt } from "./chrome-s20-fixture.mjs";
import { s20Provider } from "./chrome-s20-provider.mjs";
import { checkS20 } from "./chrome-s20-check.mjs";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const buildHash = hash(await readFile("dist-extension/js/service-worker.js"));
const model = process.env.S20_LIVE_MODEL,
  live = liveProviderConfig(model);
const cases = s20Cases().filter(
  (c) =>
    !process.env.S20_CASES || process.env.S20_CASES.split(",").includes(c.id),
);
assert.ok(cases.length, "No selected S20 cases");
const cert = await mkdtemp(join(tmpdir(), "contextpilot-s20-cert-"));
const calls = [],
  results = [];
let current = cases[0];
const fixture = await createS1Fixture(
  cert,
  () => s20Html(current),
  s20Provider({ calls, current: () => current, live, model }),
);
const harness = await openS19Chrome({
  executable: process.env.CHROME_FOR_TESTING_BIN,
  fixture,
  liveModel: model,
});
const { panel, page, version, fixtureTarget, send } = harness;
try {
  for (const item of cases) {
    current = {
      ...item,
      kind: "table",
      n: 0,
      actionCalls: 0,
      actionPrompt: s20Prompt(item),
    };
    const start = calls.length,
      started = Date.now();
    try {
      await send({ kind: "CANCEL" });
      await cdp(page.webSocketDebuggerUrl, "Page.navigate", {
        url: `https://s1.fixture.test:${fixture.fixturePort}/?variant=${item.seed}`,
      });
      await sleep(600);
      await cdp(version.webSocketDebuggerUrl, "Target.activateTarget", {
        targetId: fixtureTarget.targetId,
      });
      const errorsBefore = await evaluate(
        panel,
        "document.querySelectorAll('.event-card[data-kind=error]').length",
      );
      const goalBefore = await evaluate(
        panel,
        "['모델이 목표 완료','목표에 남은 작업','목표 완료로 처리하지 않습니다'].map(t=>document.querySelector('#chat-messages').textContent.split(t).length-1)",
      );
      await evaluate(
        panel,
        `(()=>{document.querySelector('#mode-act').click();document.querySelector('#chat-input').value=${JSON.stringify(current.actionPrompt)};document.querySelector('#chat-form').requestSubmit();return true})()`,
      );
      const deadline = started + (model ? 240000 : 90000);
      let finalFeedback = false;
      while (Date.now() < deadline) {
        await sleep(150);
        await evaluate(
          panel,
          `(()=>{for(const label of ['일반 한 단계 실행','이번 요청에 허용','계획 승인','이번 단계 실행','이번만 허용','확인하고 실행']){for(const c of [...document.querySelectorAll('.event-card')].filter(c=>c.dataset.testSeen!=='1')){const b=[...c.querySelectorAll('button')].find(b=>!b.disabled&&b.textContent.includes(label));if(b){c.dataset.testSeen='1';b.click();break}}}return true})()`,
        );
        const goal = calls
          .slice(start)
          .flatMap((x) => x.response)
          .findLast((t) => t.name === "report_goal_status")?.goal;
        if (goal) {
          const i = goal === "completed" ? 0 : goal === "incomplete" ? 1 : 2;
          const finished = await evaluate(
            panel,
            `document.querySelector('#chat-messages').textContent.split(${JSON.stringify(["모델이 목표 완료", "목표에 남은 작업", "목표 완료로 처리하지 않습니다"][i])}).length-1>${goalBefore[i]} && document.querySelector('#chat-send').dataset.state==='send'`,
          );
          if (finished) {
            finalFeedback = true;
            break;
          }
        }
        if (
          await evaluate(
            panel,
            `document.querySelectorAll('.event-card[data-kind=error]').length>${errorsBefore} && document.querySelector('#chat-send').dataset.state==='send'`,
          )
        )
          break;
      }
      assert.equal(
        await evaluate(
          panel,
          "document.querySelector('#chat-send').dataset.state",
        ),
        "send",
        "S20 request did not finish",
      );
      assert.ok(
        finalFeedback,
        "S20 final goal feedback missing before deadline",
      );
      const own = calls.slice(start),
        zip = await checkS20({ c: current, own, panel, page });
      results.push({
        id: item.id,
        pass: true,
        chrome: version.Browser,
        build_hash: buildHash,
        prompt_hash: hash(current.actionPrompt),
        elapsed_ms: Date.now() - started,
        provider: model ? live.provider : "controlled",
        model: model ?? "fixture",
        calls: own,
        zip,
      });
      console.log(`S20 ${item.id}: PASS`);
    } catch (error) {
      results.push({
        id: item.id,
        pass: false,
        chrome: version.Browser,
        build_hash: buildHash,
        prompt_hash: hash(current.actionPrompt),
        elapsed_ms: Date.now() - started,
        error: String(error),
        calls: calls.slice(start),
      });
      console.log(`S20 ${item.id}: FAIL ${error}`);
    }
    if (process.env.S20_REPORT)
      await writeFile(process.env.S20_REPORT, JSON.stringify(results, null, 2));
  }
  assert.ok(
    results.every((r) => r.pass),
    JSON.stringify(
      results.filter((r) => !r.pass).map((r) => ({ id: r.id, error: r.error })),
    ),
  );
} finally {
  await harness.close();
  await new Promise((resolve) => fixture.fixture.close(resolve));
  await rm(cert, { recursive: true, force: true, maxRetries: 3 });
}
