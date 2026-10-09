import assert from "node:assert/strict";
import { cdp, evaluate, waitFor } from "./chrome-cdp-utils.mjs";

export const checkS10Actions = async ({
  panel,
  panelWindowId,
  fixturePage,
  version,
  worker,
  cdpPort,
  captures,
}) => {
  const send = (payload) =>
    evaluate(
      panel,
      `chrome.runtime.sendMessage(${JSON.stringify({ kind: "PANEL_REQUEST", window_id: panelWindowId, payload })})`,
    );
  await evaluate(
    panel,
    `(() => {
    const original=chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage=(message,...args)=>{
      if(message.payload?.kind==='CHAT_REQUEST_START')window.s10RequestId=message.payload.request_id;
      return original(message,...args);
    }; return chrome.storage.local.set({provider_settings:{schema_version:1,providers:{fixture:{plugin_id:'contextpilot.openai-compatible',plugin_version:'1.0.0',label:'fixture',base_url:'https://page-api-fixture.invalid/v1',wire_api:'chat_completions',model:'fixture',api_key:'S10_SECRET_KEY',api_key_header:'authorization_bearer',headers:[],timeout_ms:30000,enabled:true}},active_provider:'fixture'}});
  })()`,
  );
  await send({
    schema_version: 1,
    kind: "DIAGNOSTICS_SETTINGS_SET",
    level: "trace",
  });
  const button = (label) =>
    evaluate(
      panel,
      `(() => {const button=[...document.querySelectorAll('#chat-messages button')].reverse().find(item=>!item.disabled && item.textContent===${JSON.stringify(label)});if(!button)return false;button.click();return true;})()`,
    );
  const hasButton = (label) =>
    evaluate(
      panel,
      `[...document.querySelectorAll('#chat-messages button')].some(item=>!item.disabled && item.textContent===${JSON.stringify(label)})`,
    );
  const status = async () => {
    const response = await send({
      schema_version: 1,
      kind: "CHAT_REQUEST_STATUS",
      request_id: await evaluate(panel, "s10RequestId"),
    });
    return response.request ?? response;
  };
  const counts = () =>
    evaluate(
      fixturePage,
      "({calls:callCount,value:document.querySelector('select').value})",
    );
  const terminal = async () => {
    const result = await waitFor(
      async () => {
        const result = await status();
        return result.state === "TERMINAL" ? result : undefined;
      },
      20000,
      "S10 request did not settle",
    );
    await waitFor(
      () =>
        evaluate(
          panel,
          "document.querySelector('#chat-send')?.dataset.state==='send'",
        ),
      10000,
      "S10 panel did not settle after goal feedback",
    );
    return result;
  };
  const submit = async (mode = "normal", selected = "low") => {
    await evaluate(
      fixturePage,
      `(() => {window.mode=${JSON.stringify(mode)};document.querySelector('select').value=${JSON.stringify(selected)};return true;})()`,
    );
    const baseline = await counts();
    await evaluate(
      panel,
      "(() => {document.querySelector('#mode-act').click();document.querySelector('#chat-input').value='Select High variant';document.querySelector('#chat-form').requestSubmit();return true;})()",
    );
    await waitFor(
      () => hasButton("이번 단계 실행"),
      15000,
      "S10 review absent",
    ).catch(async (error) => {
      throw Error(
        error.message +
          JSON.stringify({
            status: await status(),
            text: await evaluate(
              panel,
              "document.querySelector('#chat-messages').textContent",
            ),
            offered: captures
              .slice(-3)
              .map((body) => body.tools?.map((tool) => tool.function.name)),
          }),
      );
    });
    assert.equal(
      (await counts()).calls,
      baseline.calls,
      "invoked before review",
    );
    return baseline;
  };
  const approve = async (permission = false) => {
    assert.equal(await button("이번 단계 실행"), true);
    if (permission) {
      await waitFor(
        () => hasButton("이번만 허용"),
        10000,
        "S10 permission absent",
      ).catch(async (error) => {
        throw new Error(
          error.message +
            JSON.stringify({
              status: await status(),
              text: await evaluate(
                panel,
                "document.querySelector('#chat-messages').textContent",
              ),
            }),
        );
      });
      assert.equal((await counts()).calls, 0);
      assert.equal(await button("이번만 허용"), true);
    }
    return terminal();
  };
  let baseline = await submit();
  const first = await approve(true);
  assert.equal(
    first.outcome,
    "VERIFIED",
    JSON.stringify({
      first,
      counts: await counts(),
      snapshot: await evaluate(
        worker,
        "chrome.tabs.query({}).then(async tabs => chrome.tabs.sendMessage(tabs.find(tab => tab.url?.includes('page-api-fixture.invalid')).id,{kind:'CONTENT_SNAPSHOT',scope:'all_dom'}))",
      ),
    }),
  );
  assert.deepEqual(await counts(), {
    calls: baseline.calls + 1,
    value: "high",
  });
  // Delay the production probe response inside this isolated Chrome worker.
  // No test runtime messages or model tools are added to the product.
  for (const replacement of [false, true]) {
    baseline = await submit();
    await evaluate(
      worker,
      `(() => {
      const original=chrome.scripting.executeScript.bind(chrome.scripting);
      globalThis.s10ProbeWaiting=false;
      chrome.scripting.executeScript=async injection=>{
        const result=await original(injection);
        if(injection.world==='MAIN' && injection.args?.length===0){
          chrome.scripting.executeScript=original;
          globalThis.s10ProbeWaiting=true;
          await new Promise(resolve=>globalThis.s10ReleaseProbe=resolve);
        }
        return result;
      }; return true;
    })()`,
    );
    await button("이번 단계 실행");
    if (
      await waitFor(
        () => hasButton("이번만 허용"),
        1500,
        "permission absent",
      ).catch(() => false)
    )
      await button("이번만 허용");
    await waitFor(
      () => evaluate(worker, "s10ProbeWaiting"),
      10000,
      "probe gate absent",
    );
    const originalId = await evaluate(panel, "s10RequestId");
    await evaluate(panel, "document.querySelector('#chat-send').click()");
    const cancelled = await terminal();
    assert.equal(cancelled.outcome, "CANCELLED");
    let replacementStatus;
    if (replacement) {
      await submit();
      replacementStatus = await status();
      assert.equal(replacementStatus.state, "WAITING_USER");
    }
    await evaluate(worker, "s10ReleaseProbe();true");
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal((await counts()).calls, baseline.calls);
    const old = await send({
      schema_version: 1,
      kind: "CHAT_REQUEST_STATUS",
      request_id: originalId,
    });
    assert.equal(old.request.outcome, "CANCELLED");
    if (replacement) {
      assert.deepEqual(await status(), replacementStatus);
      await send({
        schema_version: 1,
        kind: "CHAT_REQUEST_CANCEL",
        request_id: await evaluate(panel, "s10RequestId"),
      });
      await terminal();
    }
  }
  baseline = await submit("normal", "high");
  // A new request needs its own explicit review and permission grant.
  await button("이번 단계 실행");
  if (
    await waitFor(
      () => hasButton("이번만 허용"),
      3000,
      "permission absent",
    ).catch(() => false)
  )
    await button("이번만 허용");
  assert.equal((await terminal()).outcome, "VERIFIED");
  assert.equal((await counts()).calls, baseline.calls);

  const executeCase = async (mode, expected) => {
    const before = await submit(mode);
    await button("이번 단계 실행");
    if (
      await waitFor(
        () => hasButton("이번만 허용"),
        1500,
        "permission absent",
      ).catch(() => false)
    )
      await button("이번만 허용");
    const result = await terminal();
    assert.equal(result.outcome, expected.outcome, JSON.stringify(result));
    if (expected.code) assert.equal(result.code, expected.code);
    assert.equal((await counts()).calls, before.calls + 1);
    const again = await send({
      schema_version: 1,
      kind: "CHAT_REQUEST_RESUME",
      request_id: await evaluate(panel, "s10RequestId"),
      selection: { selection_id: "fake", candidate_id: "fake" },
    });
    assert.equal(again.ok, false);
    assert.equal((await counts()).calls, before.calls + 1);
  };
  await executeCase("fake", {
    outcome: "UNKNOWN",
    code: "POSTCONDITION_UNVERIFIED",
  });
  await executeCase("throw", {
    outcome: "UNKNOWN",
    code: "PAGE_API_CALL_FAILED",
  });
  await executeCase("hang", { outcome: "UNKNOWN", code: "PAGE_API_TIMEOUT" });
  baseline = await submit();
  await evaluate(fixturePage, "demoControls.apiVersion=2");
  await button("이번 단계 실행");
  if (
    await waitFor(
      () => hasButton("이번만 허용"),
      1500,
      "permission absent",
    ).catch(() => false)
  )
    await button("이번만 허용");
  assert.equal((await terminal()).code, "PAGE_API_UNAVAILABLE");
  assert.equal((await counts()).calls, baseline.calls);
  await evaluate(fixturePage, "demoControls.apiVersion=1");
  const denied = await send({
    kind: "ACT_APPROVE",
    session_id: "forged",
    proposal_id: "forged",
  });
  assert.equal(denied.ok, false);
  const exportResult = await send({
    schema_version: 1,
    kind: "DIAGNOSTICS_BUNDLE_EXPORT",
    request_id: await evaluate(panel, "s10RequestId"),
  });
  assert.equal(exportResult.ok, true);
  assert.equal(JSON.stringify(exportResult).includes("S10_SECRET_"), false);
  const wire = JSON.stringify(captures.map((request) => request.tools));
  for (const forbidden of [
    "demoControls",
    "selectVariant",
    "fixture_variant",
    "S10_SECRET_KEY",
  ])
    assert.equal(wire.includes(forbidden), false);
  // Scope changes after actual dispatch cannot become VERIFIED.
  await executeCase("scope", { outcome: "UNKNOWN" });
  baseline = await submit();
  const oldReview = await send({
    schema_version: 1,
    kind: "CHAT_REQUEST_STATUS",
    request_id: await evaluate(panel, "s10RequestId"),
  });
  await cdp(fixturePage.webSocketDebuggerUrl, "Page.navigate", {
    url: "https://page-api-fixture.invalid/variant?before-approval",
  });
  await waitFor(
    () =>
      evaluate(
        fixturePage,
        "document.readyState === 'complete' && location.search === '?before-approval'",
      ),
    10000,
    "preapproval navigation did not load",
  );
  const staleApproval = await send({
    kind: "ACT_APPROVE",
    session_id: oldReview.result.session_id,
    proposal_id: oldReview.result.proposal_id,
  });
  assert.equal(staleApproval.ok, false);
  assert.equal((await counts()).calls, 0);
  await terminal();
  const beforeStop = await submit("delay");
  await button("이번 단계 실행");
  if (
    await waitFor(
      () => hasButton("이번만 허용"),
      1500,
      "permission absent",
    ).catch(() => false)
  )
    await button("이번만 허용");
  await waitFor(
    async () => (await counts()).calls === beforeStop.calls + 1,
    10000,
    "dispatch never started",
  );
  await evaluate(panel, "document.querySelector('#chat-send').click()");
  const stopped = await terminal();
  assert.equal(stopped.outcome, "UNKNOWN");
  // The page may finish a delayed local change; the request must stay terminal.
  await new Promise((resolve) => setTimeout(resolve, 1200));
  assert.equal((await status()).outcome, stopped.outcome);
  assert.equal((await counts()).calls, beforeStop.calls + 1);
  const beforeRestart = await submit("hang");
  await button("이번 단계 실행");
  if (
    await waitFor(
      () => hasButton("이번만 허용"),
      1500,
      "permission absent",
    ).catch(() => false)
  )
    await button("이번만 허용");
  await waitFor(
    async () => (await counts()).calls === beforeRestart.calls + 1,
    10000,
    "restart dispatch absent",
  );
  const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then(
    (r) => r.json(),
  );
  const activeWorker = targets.find(
    (item) => item.type === "service_worker" && item.url === worker.url,
  );
  await cdp(version.webSocketDebuggerUrl, "Target.closeTarget", {
    targetId: activeWorker.id,
  });
  const recovered = await waitFor(
    async () => {
      const result = await status().catch(() => undefined);
      return result?.state === "TERMINAL" ? result : undefined;
    },
    10000,
    "restart request not recovered",
  );
  assert.equal(recovered.outcome, "UNKNOWN");
  assert.equal((await counts()).calls, beforeRestart.calls + 1);
};
