import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { waitFor, cdp, evaluate } from "../chrome-cdp-utils.mjs";
export async function historyPanelCases({
  worker,
  panel,
  targets,
  reportPath,
  source,
  taskId,
}) {
  const one = (phase) =>
    waitFor(
      () =>
        evaluate(
          panel,
          `document.querySelectorAll('[data-kind=task-history]').length===1 && document.querySelector('[data-kind=task-history] .tool-state')?.textContent===${JSON.stringify(phase)}`,
        ),
      8000,
      `HISTORY_${phase}`,
    ).catch(async (error) => {
      console.error(
        JSON.stringify(
          await cdp(panel.webSocketDebuggerUrl, "Runtime.evaluate", {
            expression:
              "({url:location.href,title:document.title,status:document.querySelector('#status')?.textContent,scripts:[...document.scripts].map(s=>s.src),body:document.body?.textContent?.slice(0,150)})",
            returnByValue: true,
          }),
        ),
      );
      console.error(
        JSON.stringify(
          await evaluate(
            panel,
            `chrome.runtime.sendMessage({kind:'task.history',taskId:${JSON.stringify(taskId)},afterSequence:0}).catch(()=>({reason:'transport-failed'}))`,
          ),
        ),
      );
      throw error;
    });
  await one("일시 중지");
  assert.equal(
    await evaluate(
      panel,
      "document.querySelectorAll('[data-kind=task-history] button').length",
    ),
    0,
  );
  const copied = await evaluate(
    worker,
    "chrome.tabs.create({url:chrome.runtime.getURL('sidepanel/index.html'),active:false}).then(t=>t.id)",
  );
  const copiedTarget = await waitFor(
    async () =>
      (await targets()).find(
        (t) => t.url.endsWith("/sidepanel/index.html") && t.id !== panel.id,
      ),
    3000,
    "COPY",
  );
  await waitFor(
    () =>
      evaluate(
        copiedTarget,
        "document.querySelector('#status').textContent.includes('disconnected')",
      ),
    5000,
    "COPIED_READER_DENIED",
  );
  assert.equal(
    await evaluate(
      copiedTarget,
      "document.querySelectorAll('[data-kind=task-history]').length",
    ),
    0,
  );
  await evaluate(worker, `chrome.tabs.remove(${copied}).then(()=>true)`);
  await writeFile(reportPath + ".prune", "true");
  await waitFor(
    async () => (await source())?.state === "PRUNED",
    3000,
    "PRUNED",
  );
  await cdp(panel.webSocketDebuggerUrl, "Page.reload");
  await one("일시 중지");
  await waitFor(
    () =>
      evaluate(
        panel,
        "document.querySelector('[data-kind=task-history] .event-detail').textContent.includes('이전 이벤트 일부')",
      ),
    3000,
    "SNAPSHOT_APPLIED",
  );

  return one;
}
