import { checkS5UiEvents } from "./chrome-s5-ui-events.mjs";
import { checkS5UiViewport } from "./chrome-s5-ui-viewport.mjs";
import { waitFor } from "./chrome-cdp-utils.mjs";

export const checkS5Ui = async (panelUrl) => {
  // Keep this CDP session open: the preload belongs to the session on reload.
  const socket = new WebSocket(panelUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let nextId = 0;
  const cdp = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      const receive = (event) => {
        const result = JSON.parse(event.data);
        if (result.id !== id) return;
        socket.removeEventListener("message", receive);
        if (result.error) reject(new Error(result.error.message));
        else resolve(result.result);
      };
      socket.addEventListener("message", receive);
      socket.send(JSON.stringify({ id, method, params }));
    });
  const run = async (expression) =>
    (
      await cdp("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      })
    ).result?.value;
  await cdp("Page.enable");
  const injected = await cdp("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      const originalSend = chrome.runtime.sendMessage.bind(chrome.runtime);
      const originalConnect = chrome.runtime.connect.bind(chrome.runtime);
      const state = {receiver: undefined, resync: 0, gap: []};
      state.emit = event => state.receiver?.({kind:'CHAT_EVENT', event});
      window.__s5 = state;
      chrome.runtime.sendMessage = (message, ...args) => {
        if (message.kind === 'CHAT_RECOVER') return Promise.resolve({ok:true, tab_id:1, events:[]});
        if (message.kind === 'CHAT_RESYNC') {state.resync++; return Promise.resolve({ok:true, events:state.gap.filter(event => event.sequence > message.sequence)});}
        if (message.kind === 'PANEL_REQUEST' || message.kind === 'CANCEL') return Promise.resolve({ok:true});
        return originalSend(message, ...args);
      };
      chrome.runtime.connect = info => info.name === 'contextpilot-panel' ? {
        postMessage() {}, disconnect() {},
        onMessage: {addListener(listener) {state.receiver = listener;}},
        onDisconnect: {addListener() {}}
      } : originalConnect(info);
    })();`,
  });
  try {
    await cdp("Page.reload");
    await waitFor(
      () =>
        run(
          "!!window.__s5?.receiver && !!document.querySelector('#chat-send')",
        ),
      5_000,
      "S5_UI_PRELOAD_FAILED",
    );
    const base = {
      session_id: "session-abcdefghijklmnop",
      thread_id: "thread-abcdefghijklmnop",
      tab_id: 1,
    };
    const first = "run-first-abcdefghijkl";
    const event = (sequence, type, fields = {}, runId = first) => ({
      ...base,
      run_id: runId,
      sequence,
      type,
      ...fields,
    });
    const emit = (value) => run(`window.__s5.emit(${JSON.stringify(value)})`);
    await checkS5UiEvents({ run, emit, event, base });
    await checkS5UiViewport({ cdp, run, emit, event });
  } finally {
    await cdp("Page.removeScriptToEvaluateOnNewDocument", {
      identifier: injected.identifier,
    });
    socket.close();
  }
};
