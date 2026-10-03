import assert from "node:assert/strict";
import { cdp, evaluate, waitFor, sleep } from "./chrome-cdp-utils.mjs";
export const checkS13Lifecycle = async ({
  send,
  status,
  terminal,
  hasButton,
  click,
  navigate,
  submit,
  contexts,
  approve,
  checkContext,
  panel,
  page,
  worker,
  version,
  cdpPort,
  providerRequests,
  control,
}) => {
  // Stop during MAIN read must drop the late result before provider dispatch.
  await navigate("/variant", true);
  await evaluate(page, "readMode='delay';true");
  const beforeStop = contexts().length;
  await submit("ask");
  await approve();
  await waitFor(
    () => evaluate(page, "readCount===1"),
    10000,
    "S13 delayed read did not start",
  );
  const stop = await send({
    schema_version: 1,
    kind: "CHAT_REQUEST_CANCEL",
    request_id: await evaluate(panel, "s13RequestId"),
  });
  assert.equal((stop.request ?? stop).outcome, "CANCELLED");
  await sleep(1200);
  assert.equal(contexts().length, beforeStop);

  // Scope changes while waiting for a provider cannot publish its late answer
  // or accept a mutation proposal in either mode.
  for (const mode of ["ask", "act"]) {
    await navigate("/variant", true);
    control.mode = "hold";
    const before = contexts().length;
    await submit(
      mode,
      mode === "act" ? "데이터를 분석하고 저장해" : "데이터를 분석 요약해",
    );
    await approve();
    await waitFor(
      () => control.release && contexts().length > before,
      10000,
      "S13 held provider did not receive data",
    );
    await evaluate(
      page,
      "history.pushState({},'',location.pathname+'#changed');true",
    );
    // Force a fresh content snapshot; this observes same-document scope changes.
    await evaluate(
      worker,
      "chrome.tabs.query({}).then(tabs=>chrome.tabs.sendMessage(tabs.find(tab=>tab.url?.includes('page-api-fixture.invalid')).id,{kind:'CONTENT_SNAPSHOT',scope:'all_dom'}))",
    );
    control.release();
    control.mode = "normal";
    const result = await terminal();
    assert.ok(
      ["FAILED", "CANCELLED"].includes(result.outcome),
      JSON.stringify(result),
    );
    if (result.outcome === "FAILED")
      assert.equal(result.code, "PAGE_SCOPE_STALE");
    assert.equal(await evaluate(page, "saveCount"), 0);
    assert.equal(
      await evaluate(
        panel,
        "document.querySelector('#chat-messages').textContent.includes('S13_LATE_ANSWER')",
      ),
      false,
    );
  }
  console.log(
    "S13 Stop and provider-response scope invalidation passed for Ask/Act",
  );
};
export const checkS13Restart = async ({
  send,
  status,
  terminal,
  hasButton,
  click,
  navigate,
  submit,
  contexts,
  approve,
  checkContext,
  panel,
  page,
  worker,
  version,
  cdpPort,
  providerRequests,
  control,
}) => {
  // A worker restart cancels waiting selection and never restores read data.
  await navigate("/variant?multi", true);
  await submit("ask");
  await waitFor(
    () => hasButton("reviewed page summary"),
    10000,
    "S13 restart selection absent",
  );
  const restartId = await evaluate(panel, "s13RequestId");
  const beforeRestart = contexts().length;
  const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then(
    (response) => response.json(),
  );
  const activeWorker = targets.find(
    (target) => target.type === "service_worker" && target.url === worker.url,
  );
  await cdp(version.webSocketDebuggerUrl, "Target.closeTarget", {
    targetId: activeWorker.id,
  });
  const recovered = await terminal();
  assert.equal(recovered.outcome, "FAILED");
  assert.equal(contexts().length, beforeRestart, `replayed ${restartId}`);
  console.log(
    "S13 worker restart with pending source selection: terminal recovery and no read/provider replay passed",
  );
};
