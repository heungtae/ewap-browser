import {
  verifyS21Ui,
  s21BuildHash,
  s21Completion,
  verifyS21Result,
} from "./chrome-s21-ui.mjs";
import { s21Html, s21Label } from "./chrome-s21-fixture.mjs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { createS1Fixture } from "./chrome-s1-fixture.mjs";
import { openS19Chrome } from "./chrome-s19-harness.mjs";
import { cdp, evaluate, sleep } from "./chrome-cdp-utils.mjs";
import { liveProviderConfig } from "./live-provider-config.mjs";
import { s21Provider } from "./chrome-s21-provider.mjs";
const model = process.env.S21_LIVE_MODEL,
  live = liveProviderConfig(model);
const cases = [
  "generic-click",
  "generic-unchanged",
  "element",
  "normal",
  "delayed",
  "replacement",
  "not-completed",
  "already",
  "blocked",
].filter(
  (id) =>
    !process.env.S21_CASES || process.env.S21_CASES.split(",").includes(id),
);
assert.ok(cases.length);
const variant = Number(process.env.S21_VARIANT ?? 0);
assert.ok(Number.isInteger(variant) && variant >= 0 && variant <= 3);
let current = { id: cases[0], n: 0 };
const calls = [],
  results = [];
const build = await s21BuildHash();
const cert = await mkdtemp(join(tmpdir(), "contextpilot-s21-cert-"));
const html = () => s21Html(current.id, variant);
const fixture = await createS1Fixture(
  cert,
  html,
  s21Provider({ calls, current: () => current, live, model }),
);
const harness = await openS19Chrome({
  executable: process.env.CHROME_FOR_TESTING_BIN,
  fixture,
  liveModel: model,
});
try {
  for (const id of cases) {
    current = { id, n: 0 };
    const start = calls.length,
      started = Date.now();
    try {
      await harness.send({ kind: "CANCEL" });
      await cdp(harness.page.webSocketDebuggerUrl, "Page.navigate", {
        url: `https://s1.fixture.test:${fixture.fixturePort}/?case=${id}`,
      });
      await sleep(600);
      await cdp(harness.version.webSocketDebuggerUrl, "Target.activateTarget", {
        targetId: harness.fixtureTarget.targetId,
      });
      await evaluate(
        harness.panel,
        `(()=>{document.querySelector('#mode-act').click();document.querySelector('#chat-input').value=${JSON.stringify(id.startsWith("generic-") ? "Click the visible button once and confirm whether its label changed to Done." : `Select the ${s21Label(id, variant)} radio option and confirm its current UI state. Do not perform any other action.`)};document.querySelector('#chat-form').requestSubmit();return true})()`,
      );
      const deadline = Date.now() + (model ? 120000 : 30000);
      let settled = false;
      while (Date.now() < deadline) {
        await sleep(150);
        await evaluate(
          harness.panel,
          `(()=>{for(const label of ['일반 한 단계 실행','이번 요청에 허용','계획 승인','이번 단계 실행','이번만 허용','확인하고 실행']){for(const c of [...document.querySelectorAll('.event-card')].filter(c=>c.dataset.testSeen!=='1')){const b=[...c.querySelectorAll('button')].find(b=>!b.disabled&&b.textContent.includes(label));if(b){c.dataset.testSeen='1';b.click();break}}}return true})()`,
        );
        const recent = calls.slice(start);
        const goal = recent
          .flatMap((c) => c.response)
          .findLast((c) => c.name === "report_goal_status");
        const idle = await evaluate(
          harness.panel,
          "document.querySelector('#chat-send').dataset.state==='send'",
        );
        if (idle && (goal || recent.length >= 2)) {
          settled = true;
          break;
        }
      }
      assert.ok(settled, `${id}: request did not settle`);
      const recent = calls.slice(start);
      const mutationCount = await evaluate(harness.page, "window.clicks");
      const checked = await evaluate(
        harness.page,
        "document.getElementById('option').getAttribute('aria-checked') ?? String(document.getElementById('option').checked)",
      );
      const assessmentCalls = recent.filter((c) =>
        c.tools.some((t) => t.name === "assess_action_result"),
      ).length;
      const elementCalls = recent.filter((c) =>
        c.tools.some((t) => t.name === "assess_element"),
      ).length;
      const finalGoal = recent
        .flatMap((c) => c.response)
        .findLast((c) => c.name === "report_goal_status")?.goal;
      if (id.startsWith("generic-")) {
        const receipt = recent
          .flatMap((call) => call.returned)
          .find((result) => result.execution);
        assert.equal(receipt?.dispatched, true);
        assert.equal(receipt?.outcome, "UNKNOWN");
        assert.equal(receipt?.code, "POSTCONDITION_UNVERIFIED");
      }
      const accepted = await s21Completion(harness);
      verifyS21Result({
        id,
        model,
        elementCalls,
        mutationCount,
        assessmentCalls,
        finalGoal,
        checked,
        accepted,
      });
      const text = await evaluate(
        harness.panel,
        "document.querySelector('#status').textContent",
      );
      if (finalGoal === "completed")
        assert.ok(
          text.includes("목표의 완료를 확인"),
          `Current completion UI: ${text}`,
        );
      else assert.ok(!text.includes("목표의 완료를 확인"));
      const visibleCompletion = await verifyS21Ui(harness, finalGoal);
      results.push({
        id,
        pass: true,
        mutationCount,
        checked,
        assessmentCalls,
        elementCalls,
        finalGoal,
        completionUi: text,
        visibleCompletion,
        accepted,
        latencyMs: Date.now() - started,
        calls: recent,
      });
      if (process.env.S21_SCREENSHOT)
        await writeFile(
          `${process.env.S21_SCREENSHOT}-${id}.png`,
          Buffer.from(
            (
              await cdp(
                harness.panel.webSocketDebuggerUrl,
                "Page.captureScreenshot",
                { format: "png" },
              )
            ).data,
            "base64",
          ),
        );
    } catch (error) {
      results.push({
        id,
        pass: false,
        error: error.message,
        calls: calls.slice(start),
      });
    }
  }
  const report = {
    model: model ?? "controlled",
    variant,
    build,
    results,
  };
  await writeFile(
    process.env.S21_REPORT ?? "/tmp/s21-controlled.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify(
      results.map(
        ({ id, pass, error, mutationCount, assessmentCalls, finalGoal }) => ({
          id,
          pass,
          error,
          mutationCount,
          assessmentCalls,
          finalGoal,
        }),
      ),
      null,
      2,
    ),
  );
  assert.ok(
    results.every((r) => r.pass),
    "S21 failures",
  );
} finally {
  await harness.close();
  await new Promise((resolve) => fixture.fixture.close(resolve));
  await rm(cert, { recursive: true, force: true });
}
