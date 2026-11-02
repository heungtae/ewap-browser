import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { waitFor, cdp, evaluate } from "../chrome-cdp-utils.mjs";
export async function historyLossCases({
  worker,
  panel,
  targets,
  port,
  source,
  observedRead,
  reportPath,
  one,
  restartDaemon,
}) {
  const browser = await fetch(`http://127.0.0.1:${port}/json/version`).then(
    (r) => r.json(),
  );
  assert.equal(
    await evaluate(panel, "window.__historyFixture.seedOldValue()"),
    true,
  );
  await waitFor(
    () =>
      evaluate(
        panel,
        "document.querySelector('[data-kind=value] input').disabled && document.querySelector('[data-kind=value] input').value===''",
      ),
    3000,
    "HISTORICAL_VALUE_LOCKED",
  );
  const readBeforeWorkerLoss = await observedRead();
  const stoppedWorker = worker.id;
  await cdp(browser.webSocketDebuggerUrl, "Target.closeTarget", {
    targetId: stoppedWorker,
  });
  worker = await waitFor(
    async () =>
      (await targets()).find(
        (t) =>
          t.type === "service_worker" &&
          t.url.endsWith("/js/service-worker.js") &&
          t.id !== stoppedWorker,
      ),
    10000,
    "WORKER_RESTARTED",
  );
  await one("일시 중지");
  const workerRead = await waitFor(
    async () => {
      const r = await observedRead();
      return (
        r?.connectionId !== readBeforeWorkerLoss.connectionId &&
        r?.afterSequence === 5 &&
        r
      );
    },
    6000,
    "WORKER_RESUME_CURSOR",
  );
  await restartDaemon();
  await one("일시 중지");
  await waitFor(
    () =>
      evaluate(
        panel,
        "document.querySelector('#status').textContent.includes('작업 상태') && document.querySelector('#activity-status').textContent==='작업 일시 중지'",
      ),
    8000,
    "NATIVE_HISTORY_RECOVERED",
  );
  const nativeRead = await waitFor(
    async () => {
      const r = await observedRead();
      return (
        r?.connectionId !== workerRead.connectionId &&
        r?.afterSequence === 5 &&
        r
      );
    },
    6000,
    "NATIVE_RESUME_CURSOR",
  );
  assert.equal(nativeRead.cursor, 5);
  assert.equal(
    await evaluate(
      panel,
      "document.querySelector('[data-kind=value] input').disabled && document.querySelector('[data-kind=value] input').value==='' && window.__historyFixture.responses()===0",
    ),
    true,
  );
  await writeFile(reportPath + ".cancel", "true");
  await waitFor(
    async () => (await source())?.state === "CANCELLED",
    3000,
    "CANCELLED",
  );
  await one("취소됨");
  assert.equal(
    await evaluate(
      panel,
      "document.querySelector('[data-kind=task-history] .event-detail').textContent.includes('실행 결과는 아직 확인되지')",
    ),
    true,
  );

  return {
    browser,
    workerActuallyReplaced: worker.id !== stoppedWorker,
    workerResumeCursor: workerRead.afterSequence,
    nativeResumeCursor: nativeRead.afterSequence,
  };
}
