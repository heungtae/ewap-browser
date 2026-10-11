import { countS22ApprovalCards } from "./chrome-s22-settings.mjs";
import { s21BuildHash } from "./chrome-s21-ui.mjs";
import { finishS21Case } from "./chrome-s21-case-result.mjs";
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
        if (process.env.S22_MODE !== "full")
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
        if (idle && recent.some((c) => c.upstream_status >= 400))
          throw new Error(
            `UPSTREAM_HTTP_${recent.find((c) => c.upstream_status >= 400).upstream_status}`,
          );
        if (idle && (goal || recent.length >= 2)) {
          settled = true;
          break;
        }
      }
      assert.ok(settled, `${id}: request did not settle`);
      results.push({
        ...(await finishS21Case({
          harness,
          recent: calls.slice(start),
          id,
          model,
        })),
        latencyMs: Date.now() - started,
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
      const approvalCards = process.env.S22_MODE
        ? await countS22ApprovalCards(harness.panel)
        : undefined;
      if (process.env.S22_MODE === "full")
        assert.equal(
          approvalCards,
          0,
          "Full Permission showed an approval card",
        );
      results.push({
        id,
        approvalCards,
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
