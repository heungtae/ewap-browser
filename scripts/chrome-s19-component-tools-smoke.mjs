import { s19Cases } from "./chrome-s19-cases.mjs";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { cdp, evaluate, sleep } from "./chrome-cdp-utils.mjs";
import { createS1Fixture } from "./chrome-s1-fixture.mjs";
import { liveProviderConfig } from "./live-provider-config.mjs";
import { s19Html, s19Private } from "./chrome-s19-fixture.mjs";
import { s19Provider } from "./chrome-s19-provider.mjs";
import { openS19Chrome } from "./chrome-s19-harness.mjs";
import {
  validateS19Case,
  s19FeedbackCounts,
  s19HasFinalFeedback,
} from "./chrome-s19-validation.mjs";
const gesture = async (target, expression) => {
  const response = await cdp(target.webSocketDebuggerUrl, "Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  return response.result?.value;
};
const executable = process.env.CHROME_FOR_TESTING_BIN;
if (!executable) throw Error("CHROME_FOR_TESTING_BIN is required");
const cert = await mkdtemp(join(tmpdir(), "contextpilot-s19-cert-"));
const calls = [],
  results = [];
let current;
const liveModel = process.env.S19_LIVE_MODEL,
  live = liveProviderConfig(liveModel);
const fixture = await createS1Fixture(
  cert,
  s19Html,
  s19Provider({ calls, current: () => current, liveModel, live }),
);
const harness = await openS19Chrome({ executable, fixture, liveModel });
const { panel, page, version, fixtureTarget, send } = harness;
try {
  const cases = s19Cases().filter(
    (item) =>
      !process.env.S19_CASES ||
      process.env.S19_CASES.split(",").includes(item.id),
  );
  for (current of cases) {
    try {
      await send({ kind: "CANCEL" });
      await send({ kind: "CHAT_CLEAR" });
      await cdp(page.webSocketDebuggerUrl, "Page.navigate", {
        url: `https://s1.fixture.test:${fixture.fixturePort}/?case=${current.id}`,
      });
      await sleep(700);
      if (current.id === "sensitive" || current.id === "vision-sensitive")
        await evaluate(
          page,
          `(()=>{const cell=document.querySelector('tbody td');cell.setAttribute('aria-label','token');cell.textContent=${JSON.stringify(s19Private)};return true})()`,
        );
      if (current.id === "alternative")
        await evaluate(
          page,
          `document.querySelector('figure').setAttribute('aria-details','measures')`,
        );
      await cdp(version.webSocketDebuggerUrl, "Target.activateTarget", {
        targetId: fixtureTarget.targetId,
      });
      const start = calls.length;
      current.feedbackBefore = await s19FeedbackCounts(panel);
      const prompt = current.action
        ? current.actionPrompt
        : `Use list_page_resources, describe_component and read_component_data to inspect the ${current.kind} component. Choose ${current.channel} explicitly. Read ${current.id === "table" ? "all mounted rows using continuation" : "a bounded sample"}. State counts, coverage and limitations. Do not change the page beyond approved bounded scrolling; do not execute code or infer chart values.`;
      await evaluate(
        panel,
        `(()=>{document.querySelector('#mode-act').click();document.querySelector('#chat-input').value=${JSON.stringify(prompt)};document.querySelector('#chat-form').requestSubmit();return true})()`,
      );
      let consent = false;
      const deadline = Date.now() + (liveModel ? 240000 : 45000);
      while (Date.now() < deadline) {
        await sleep(150);
        await evaluate(
          panel,
          `(()=>{const b=[...document.querySelectorAll('.event-card button')].find(b=>!b.disabled&&b.textContent.includes('일반 한 단계 실행'));b?.click();return true})()`,
        );
        if (current.action)
          await evaluate(
            panel,
            `(()=>{for(const label of ['계획 승인','이번 단계 실행','이번만 허용','확인하고 실행']){const cards=[...document.querySelectorAll('.event-card')].filter(c=>c.dataset.testSeen!=='1');for(const c of cards){const b=[...c.querySelectorAll('button')].find(b=>!b.disabled&&b.textContent.includes(label));if(b){c.dataset.testSeen='1';b.click();break}}}return true})()`,
          );
        const pending = await evaluate(
          panel,
          `[...document.querySelectorAll('.event-card')].some(c=>/Component 스크롤 읽기 승인|화면 이미지 전달 동의|페이지 소스 전달 동의/.test(c.textContent)&&[...c.querySelectorAll('button')].some(b=>!b.disabled))`,
        );
        if (pending) {
          if (
            !consent &&
            process.env.S19_SCREENSHOT_DIR &&
            ["scroll", "vision"].includes(current.id)
          ) {
            await evaluate(
              panel,
              "[...document.querySelectorAll('.event-card')].find(c=>/Component 스크롤 읽기 승인|화면 이미지 전달 동의/.test(c.textContent)&&[...c.querySelectorAll('button')].some(b=>!b.disabled))?.scrollIntoView({block:'center'})",
            );
            const shot = await cdp(
              panel.webSocketDebuggerUrl,
              "Page.captureScreenshot",
              { format: "png" },
            );
            await writeFile(
              join(
                process.env.S19_SCREENSHOT_DIR,
                `s19-${current.id}-approval.png`,
              ),
              Buffer.from(shot.data, "base64"),
            );
          }
          consent = true;
          if (current.id === "stop") {
            await send({ kind: "CANCEL" });
            break;
          }
          if (current.id === "stale")
            await evaluate(
              page,
              `document.getElementById('virtual').setAttribute('aria-rowcount','41')`,
            );
          await gesture(
            panel,
            `(()=>{const c=[...document.querySelectorAll('.event-card')].find(c=>/Component 스크롤 읽기 승인|화면 이미지 전달 동의|페이지 소스 전달 동의/.test(c.textContent)&&[...c.querySelectorAll('button')].some(b=>!b.disabled));[...c.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(current.id.includes("deny") ? "거부" : "이번 요청에 허용")}))?.click();return true})()`,
          );
        }
        if (
          calls.length > start &&
          (await s19HasFinalFeedback(panel, current, calls.slice(start))) &&
          (await evaluate(
            panel,
            "document.querySelector('#chat-send')?.dataset.state==='send'",
          ))
        )
          break;
      }
      await sleep(300);
      const own = calls.slice(start),
        returned = own.at(-1)?.returned ?? [];
      const zip = await validateS19Case({
        panel,
        page,
        current,
        own,
        returned,
        consent,
        liveModel,
      });
      results.push({
        id: current.id,
        pass: true,
        provider: liveModel ? live.provider : "controlled",
        model: liveModel ?? "fixture",
        consent,
        calls: own,
        zip,
      });
      console.log(`S19 ${current.id}: PASS`);
    } catch (error) {
      results.push({
        id: current.id,
        pass: false,
        error: String(error),
        calls: calls.filter((call) => call.case === current.id),
      });
      console.log(`S19 ${current.id}: FAIL ${error}`);
    }
    if (process.env.S19_REPORT)
      await writeFile(process.env.S19_REPORT, JSON.stringify(results, null, 2));
  }
  assert.ok(
    results.every((result) => result.pass),
    JSON.stringify(
      results
        .filter((result) => !result.pass)
        .map(({ id, error }) => ({ id, error })),
    ),
  );
} finally {
  await harness.close();
  await new Promise((resolve) => fixture.fixture.close(resolve));
  await rm(cert, { recursive: true, force: true, maxRetries: 3 });
}
