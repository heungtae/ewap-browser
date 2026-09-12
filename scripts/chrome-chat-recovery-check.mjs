/** Isolated Chrome fixture: expired approval leaves a gap before request two. */
export const checkChatRecovery = async (panelUrl) => {
  // Page preload scripts belong to the CDP session; keep it open across reload.
  const socket = new WebSocket(panelUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let nextId = 0;
  const cdp = (_url, method, params = {}) =>
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
  await cdp(panelUrl, "Page.enable");
  const injected = await cdp(
    panelUrl,
    "Page.addScriptToEvaluateOnNewDocument",
    {
      source: `(() => {
      const base = {session_id: 'session-abcdefghijklmnop', thread_id: 'thread-abcdefghijklmnop', tab_id: 1, run_id: 'run-first-abcdefghijkl'};
      const events = [
        {...base, sequence: 1, type: 'user_message', text: 'First request'},
        // Approval at sequence 2 was deliberately removed on restart.
        {...base, sequence: 3, type: 'run_terminal', outcome: 'VERIFIED'},
        {...base, run_id: 'run-second-abcdefghijk', sequence: 4, type: 'user_message', text: 'Second request'},
        {...base, run_id: 'run-second-abcdefghijk', sequence: 5, type: 'run_started', mode: 'act', permission_mode: 'standard'},
        {...base, run_id: 'run-second-abcdefghijk', sequence: 6, type: 'action_review_required', action: {session_id: 'session-second-abcdefgh', proposal_id: 'proposal-second-abcdef', tool: 'click_by_ref', target_name: 'Recovery fixture target'}},
        {...base, run_id: 'run-second-abcdefghijk', sequence: 7, type: 'activity_finished', stage: 'AWAITING_REVIEW'}
      ];
      const send = chrome.runtime.sendMessage.bind(chrome.runtime);
      chrome.runtime.sendMessage = (message, ...args) => {
        if (message.kind === 'CHAT_RECOVER') return Promise.resolve({ok: true, tab_id: 1, events});
        if (message.kind === 'CHAT_RESYNC') return Promise.resolve({ok: true, events: events.filter(event => event.sequence > message.sequence)});
        return send(message, ...args);
      };
    })();`,
    },
  );
  try {
    await cdp(panelUrl, "Page.reload");
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const result = await cdp(panelUrl, "Runtime.evaluate", {
        expression: `document.querySelector('#chat-messages')?.textContent.includes('Recovery fixture target') === true && document.querySelector('#activity-status')?.hidden === false`,
        returnByValue: true,
      });
      if (result.result?.value === true) {
        console.log(
          "Chrome recovered a sparse transcript and rendered request two's approval",
        );
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Sparse chat recovery blocked request two's approval");
  } finally {
    await cdp(panelUrl, "Page.removeScriptToEvaluateOnNewDocument", {
      identifier: injected.identifier,
    });
    socket.close();
  }
};
