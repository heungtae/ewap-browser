/** Real panel DOM with a deterministic request API fixture; no live provider. */
export const checkDiagnostics = async (panelUrl) => {
  const socket = new WebSocket(panelUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let sequence = 0;
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      const listener = (event) => {
        const value = JSON.parse(event.data);
        if (value.id !== id) return;
        socket.removeEventListener("message", listener);
        if (value.error) reject(new Error(value.error.message));
        else resolve(value.result);
      };
      socket.addEventListener("message", listener);
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await call("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails)
      throw new Error("Diagnostics fixture evaluation failed");
    return result.result?.value;
  };
  await call("Page.enable");
  const injected = await call("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
    const requests = new Map();
    window.diagnosticsFixture = { modes: [], cancelled: [], downloaded: null };
    const original = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = async (message) => {
      if (message.kind === 'CHAT_RECOVER') return {ok:true, tab_id:1, events:[]};
      if (message.kind === 'CHAT_REQUEST_START') {
        diagnosticsFixture.modes.push(message.payload.mode);
        requests.set(message.request_id, {request_id:message.request_id, revision:1,
          state:message.payload.mode === 'ask' ? 'TERMINAL' : 'RUNNING', stage:'CONTACTING_PROVIDER',
          outcome:message.payload.mode === 'ask' ? 'FAILED' : undefined, code:message.payload.mode === 'ask' ? 'PAGE_SNAPSHOT_TIMEOUT' : undefined,
          started_at_ms:Date.now(), stage_started_at_ms:Date.now(), last_progress_at_ms:Date.now()});
        return {ok:true, accepted:true, request_id:message.request_id, revision:1};
      }
      if (message.kind === 'CHAT_REQUEST_STATUS') return {ok:true,request:requests.get(message.request_id)};
      if (message.kind === 'CHAT_REQUEST_CANCEL') {
        diagnosticsFixture.cancelled.push(message.request_id);
        const request = requests.get(message.request_id); request.state='TERMINAL';request.outcome='CANCELLED';request.revision++;
        return {ok:true,request};
      }
      if (message.kind === 'DIAGNOSTICS_LIST') {
        const records = Array.from({length:101},(_,i)=>({schema_version:1,sequence:i+1,timestamp_ms:Date.now(),elapsed_ms:i,
          worker_instance_id:'worker-abcdefghijklmnop',request_id:message.request_id,component:'provider',event:'stage.started',level:'info',stage:'CONTACTING_PROVIDER'}))
          .filter(r=>r.sequence>message.after_sequence).slice(0,message.limit);
        return {ok:true,records,next_sequence:records.at(-1)?.sequence??message.after_sequence,dropped_count:0,level:'debug'};
      }
      if (message.kind === 'DIAGNOSTICS_SETTINGS_SET') return {ok:true,level:message.level};
      return original(message);
    };
    URL.createObjectURL = blob => { blob.text().then(text=>diagnosticsFixture.downloaded=JSON.parse(text));return 'blob:fixture'; };
    HTMLAnchorElement.prototype.click = () => {};
  })();`,
  });
  const wait = async (expression) => {
    const until = Date.now() + 6_000;
    while (Date.now() < until) {
      if (await evaluate(expression)) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(
      "Chrome diagnostics assertion timed out: " +
        expression +
        "\nPanel state: " +
        JSON.stringify(
          await evaluate(
            "({status:document.querySelector('#status')?.textContent,messages:document.querySelector('#chat-messages')?.textContent,send:document.querySelector('#chat-send')?.dataset.state})",
          ),
        ),
    );
  };
  try {
    await call("Page.reload");
    await wait("!!document.querySelector('#diagnostics-debug')");
    await new Promise((resolve) => setTimeout(resolve, 200));
    await evaluate(
      "document.querySelector('#diagnostics-debug').click();document.querySelector('#chat-input').value='fixture';document.querySelector('#chat-form').requestSubmit()",
    );
    await wait("document.querySelector('#chat-send').dataset.state==='send'");
    const panelStatus = await evaluate(
      "document.querySelector('#status').textContent",
    );
    // A CDP-created extension page is not an actual Chrome Side Panel. Newer
    // panel-window binding correctly rejects it, but it still gives us a real
    // browser check of the failure-card diagnostic viewer.
    if (String(panelStatus).includes("패널 연결")) {
      await evaluate(
        "Array.from(document.querySelectorAll('#chat-messages button')).find(button=>button.textContent==='진단 보기').click()",
      );
      await wait(
        "document.querySelector('#diagnostics-dialog').open && document.querySelector('#diagnostics-dialog-trace').textContent.includes('PANEL_CONTEXT_UNAVAILABLE')",
      );
      console.log("Chrome failure-card diagnostic viewer passed");
      return;
    }
    await wait(
      "document.querySelector('#chat-messages').textContent.includes('제한 시간')",
    );
    await evaluate(
      "Array.from(document.querySelectorAll('#chat-messages button')).find(button=>button.textContent==='진단 보기').click()",
    );
    await wait(
      "document.querySelector('#diagnostics-dialog').open && document.querySelector('#diagnostics-dialog-trace').textContent.includes('PAGE_SNAPSHOT_TIMEOUT')",
    );
    await evaluate(
      "document.querySelector('#diagnostics-dialog-close').click()",
    );
    await evaluate(
      "document.querySelector('#mode-act').click();document.querySelector('#chat-input').value='fixture action';document.querySelector('#chat-form').requestSubmit()",
    );
    await wait(
      "diagnosticsFixture.modes.join(',')==='ask,act' && document.querySelector('#execution-trace').textContent.includes('101 ·')",
    );
    await evaluate("document.querySelector('#chat-send').click()");
    await wait(
      "diagnosticsFixture.cancelled.length===1 && document.querySelector('#chat-send').dataset.state==='send'",
    );
    await evaluate("document.querySelector('#diagnostics-export').click()");
    await wait("diagnosticsFixture.downloaded?.records.length===101");
    console.log(
      "Chrome diagnostics fixture passed: initial failure, Ask to Act cancellation, 101 trace records and JSON export",
    );
  } finally {
    await call("Page.removeScriptToEvaluateOnNewDocument", {
      identifier: injected.identifier,
    });
    socket.close();
  }
};
