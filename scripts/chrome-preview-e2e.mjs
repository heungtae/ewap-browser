import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:https";
import { createServer as createTcpServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const executable = process.env.CHROME_FOR_TESTING_BIN;
if (!executable)
  throw new Error(
    "CHROME_FOR_TESTING_BIN must point to a Chrome for Testing binary",
  );
const run = promisify(execFile);
const certificateDirectory = await mkdtemp(
  join(tmpdir(), "webbrain-fixture-cert-"),
);
const profile = await mkdtemp(join(tmpdir(), "webbrain-preview-profile-"));
const reservePort = () =>
  new Promise((resolvePort, reject) => {
    const server = createTcpServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close();
      if (!address || typeof address === "string")
        reject(new Error("cannot reserve CDP port"));
      else resolvePort(address.port);
    });
  });
const cdp = async (webSocketUrl, method, params = {}) => {
  const socket = new WebSocket(webSocketUrl);
  return new Promise((resolveResult, reject) => {
    socket.addEventListener("open", () =>
      socket.send(JSON.stringify({ id: 1, method, params })),
    );
    socket.addEventListener("message", (event) => {
      const result = JSON.parse(event.data);
      if (result.id !== 1) return;
      socket.close();
      if (result.error) reject(new Error(result.error.message));
      else resolveResult(result.result);
    });
    socket.addEventListener("error", () =>
      reject(new Error("CDP connection failed")),
    );
  });
};
let fixture;
let child;
try {
  await run("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    join(certificateDirectory, "key.pem"),
    "-out",
    join(certificateDirectory, "cert.pem"),
    "-days",
    "1",
    "-subj",
    "/CN=fixture.company.test",
  ]);
  fixture = createServer(
    {
      key: await readFile(join(certificateDirectory, "key.pem")),
      cert: await readFile(join(certificateDirectory, "cert.pem")),
    },
    (_request, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(
        "<main><h1>Case 123</h1><label for='case-name'>Case name</label><input id='case-name' required><label for='priority'>Priority</label><select id='priority'><option value='low'>Low</option><option value='high'>High</option></select><label for='notify'>Notify owner</label><input id='notify' type='checkbox'><label for='approve'>Require confirmation</label><input id='approve' type='checkbox'><button>Save</button><input type='password' value='hidden'></main>",
      );
    },
  );
  await new Promise((resolveListen, reject) => {
    fixture.once("error", reject);
    fixture.listen(8443, "127.0.0.1", resolveListen);
  });
  const cdpPort = await reservePort();
  child = (await import("node:child_process")).spawn(
    executable,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--ignore-certificate-errors",
      "--host-resolver-rules=MAP fixture.company.test 127.0.0.1",
      `--user-data-dir=${profile}`,
      `--disable-extensions-except=${resolve("dist-extension")}`,
      `--load-extension=${resolve("dist-extension")}`,
      `--remote-debugging-port=${cdpPort}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  const deadline = Date.now() + 10_000;
  let version;
  while (Date.now() < deadline) {
    try {
      version = await (
        await fetch(`http://127.0.0.1:${cdpPort}/json/version`)
      ).json();
      break;
    } catch {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    }
  }
  if (!version) throw new Error("Chrome for Testing did not open CDP");
  const fixtureTarget = await cdp(
    version.webSocketDebuggerUrl,
    "Target.createTarget",
    {
      url: "https://fixture.company.test:8443/",
    },
  );
  let worker;
  while (Date.now() < deadline) {
    const targets = await (
      await fetch(`http://127.0.0.1:${cdpPort}/json/list`)
    ).json();
    worker = targets.find(
      (target) =>
        target.type === "service_worker" &&
        target.url.endsWith("/js/service-worker.js"),
    );
    if (worker) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  if (!worker) throw new Error("ContextPilot service worker was not loaded");
  const extensionId = new URL(worker.url).host;
  await cdp(version.webSocketDebuggerUrl, "Target.createTarget", {
    url: `chrome-extension://${extensionId}/sidepanel/index.html`,
  });
  let panel;
  while (Date.now() < deadline) {
    const targets = await (
      await fetch(`http://127.0.0.1:${cdpPort}/json/list`)
    ).json();
    panel = targets.find(
      (target) =>
        target.url === `chrome-extension://${extensionId}/sidepanel/index.html`,
    );
    if (panel) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  if (!panel) throw new Error("Side Panel target was not created");
  await cdp(version.webSocketDebuggerUrl, "Target.activateTarget", {
    targetId: fixtureTarget.targetId,
  });
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  const result = await cdp(panel.webSocketDebuggerUrl, "Runtime.evaluate", {
    expression:
      "(async () => await chrome.runtime.sendMessage({kind:'START_PREVIEW'}))()",
    awaitPromise: true,
    returnByValue: true,
  });
  const snapshot = result.result?.value?.snapshot;
  if (
    !snapshot ||
    !snapshot.nodes?.some(
      (node) => node.role === "button" && node.name === "Save",
    ) ||
    snapshot.nodes?.some((node) => /password/i.test(node.name))
  )
    throw new Error(
      `preview did not return the expected redacted semantic projection: ${JSON.stringify(result.result?.value)}`,
    );
  const devToolsRelay = await cdp(
    worker.webSocketDebuggerUrl,
    "Runtime.evaluate",
    {
      expression: `
        (async () => {
          const [tab] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
          if (tab?.id === undefined) return {ok: false, code: 'TAB_NOT_FOUND'};
          return chrome.tabs.sendMessage(tab.id, {
            kind: 'CONTENT_DEVTOOLS_LOG',
            level: 'info',
            label: '[ContextPilot][LLM request final]',
            detail: {step: 1, messages: [], tools: []}
          });
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    },
  );
  if (devToolsRelay.result?.value?.ok !== true)
    throw new Error(
      `content script did not accept the page DevTools log relay: ${JSON.stringify(devToolsRelay.result?.value)}`,
    );
  const originalButton = snapshot.nodes.find(
    (node) => node.role === "button" && node.name === "Save",
  );
  const fixtureMutation = await cdp(
    panel.webSocketDebuggerUrl,
    "Runtime.evaluate",
    {
      expression: `
        (async () => {
          const started = await chrome.runtime.sendMessage({
            kind: 'START_ACT', tool: 'set_text_by_ref', ref_id: ${JSON.stringify(snapshot.nodes.find((node) => node.role === "textbox" && node.name === "Case name")?.ref_id)}
          });
          if (!started.ok) return { status: started.code };
          const submitted = await chrome.runtime.sendMessage({
            kind: 'SUBMIT_ACTION_VALUE',
            run_id: started.run_id,
            value_slot_id: started.value_slot_id,
            value_kind: started.value_kind,
            value: 'fixture operator input'
          });
          return { status: submitted.ok ? 'verified' : submitted.code };
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    },
  );
  if (fixtureMutation.result?.value?.status !== "verified")
    throw new Error(
      `Side Panel fixture R1 flow did not reach a verified terminal state: ${JSON.stringify(fixtureMutation.result?.value)}`,
    );
  const fixtureSelectAndCheck = await cdp(
    panel.webSocketDebuggerUrl,
    "Runtime.evaluate",
    {
      expression: `
        (async () => {
          const snapshot = await chrome.runtime.sendMessage({kind:'START_PREVIEW'});
          const select = snapshot.snapshot.nodes.find((node) => node.role === 'combobox' && node.name === 'Priority');
          const checkbox = snapshot.snapshot.nodes.find((node) => node.role === 'checkbox' && node.name === 'Notify owner');
          if (!select || !checkbox) return { status: 'targets-missing' };
          const selected = await chrome.runtime.sendMessage({kind:'START_ACT', tool:'select_option_by_ref', ref_id:select.ref_id});
          if (!selected.ok) return { status: selected.code };
          const submitted = await chrome.runtime.sendMessage({kind:'SUBMIT_ACTION_VALUE', run_id:selected.run_id, value_slot_id:selected.value_slot_id, value_kind:selected.value_kind, value:'High'});
          if (!submitted.ok) return { status: submitted.code };
          const checked = await chrome.runtime.sendMessage({kind:'START_ACT', tool:'set_checked_by_ref', ref_id:checkbox.ref_id, argument:{checked:true}});
          if (!checked.ok) return { status: checked.code };
          const noOp = await chrome.runtime.sendMessage({kind:'START_ACT', tool:'set_checked_by_ref', ref_id:checkbox.ref_id, argument:{checked:true}});
          return { status: 'verified', no_op: noOp.code };
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    },
  );
  if (
    fixtureSelectAndCheck.result?.value?.status !== "verified" ||
    fixtureSelectAndCheck.result?.value?.no_op !== "TARGET_NOT_ACTIONABLE"
  )
    throw new Error(
      `fixture select or checkbox R1 flow did not reach a verified terminal state: ${JSON.stringify(fixtureSelectAndCheck.result?.value)}`,
    );
  const fixtureR2 = await cdp(panel.webSocketDebuggerUrl, "Runtime.evaluate", {
    expression: `
      (async () => {
        const snapshot = await chrome.runtime.sendMessage({kind:'START_PREVIEW'});
        const target = snapshot.snapshot.nodes.find((node) => node.role === 'checkbox' && node.name === 'Require confirmation');
        if (!target) return { status: 'target-missing' };
        const started = await chrome.runtime.sendMessage({kind:'START_ACT', tool:'set_checked_by_ref', ref_id:target.ref_id, argument:{checked:true}});
        if (!started.ok || started.state !== 'AWAITING_CONFIRMATION') return { status: started.code ?? started.state };
        const confirmed = await chrome.runtime.sendMessage({kind:'CONFIRM', run_id:started.run_id, confirmation_id:started.confirmation_id, confirmation_nonce:started.confirmation_nonce});
        const replay = await chrome.runtime.sendMessage({kind:'CONFIRM', run_id:started.run_id, confirmation_id:started.confirmation_id, confirmation_nonce:started.confirmation_nonce});
        return { status: confirmed.ok ? 'verified' : confirmed.code, replay_code: replay.code };
      })()
    `,
    awaitPromise: true,
    returnByValue: true,
  });
  if (
    fixtureR2.result?.value?.status !== "verified" ||
    fixtureR2.result?.value?.replay_code !== "CONFIRMATION_INVALID"
  )
    throw new Error(
      `fixture R2 confirmation flow did not enforce one-time confirmation: ${JSON.stringify(fixtureR2.result?.value)}`,
    );
  const textTarget = snapshot.nodes?.find(
    (node) => node.role === "textbox" && node.name === "Case name",
  );
  if (!textTarget)
    throw new Error("fixture textbox was not present in preview");
  const cancelled = await cdp(panel.webSocketDebuggerUrl, "Runtime.evaluate", {
    expression: `
      (async () => {
        const started = await chrome.runtime.sendMessage({
          kind: 'START_ACT', tool: 'set_text_by_ref', ref_id: ${JSON.stringify(textTarget.ref_id)}
        });
        if (!started.ok) return { status: 'start-failed' };
        const cancellation = await chrome.runtime.sendMessage({ kind: 'CANCEL' });
        if (!cancellation.ok) return { status: 'cancel-failed' };
        const replay = await chrome.runtime.sendMessage({
          kind: 'SUBMIT_ACTION_VALUE',
          run_id: started.run_id,
          value_slot_id: started.value_slot_id,
          value_kind: started.value_kind,
          value: 'cancelled fixture input'
        });
        return { status: 'cancelled', replay_code: replay.code };
      })()
    `,
    awaitPromise: true,
    returnByValue: true,
  });
  if (
    cancelled.result?.value?.status !== "cancelled" ||
    cancelled.result?.value?.replay_code !== "VALUE_BINDING_INVALID"
  )
    throw new Error(
      `cancelled value slot was accepted or did not reach terminal state: ${JSON.stringify(cancelled.result?.value)}`,
    );
  const targetList = await (
    await fetch(`http://127.0.0.1:${cdpPort}/json/list`)
  ).json();
  const fixturePage = targetList.find(
    (target) => target.id === fixtureTarget.targetId,
  );
  if (!fixturePage) throw new Error("fixture page target was not created");
  const writtenValue = await cdp(
    fixturePage.webSocketDebuggerUrl,
    "Runtime.evaluate",
    {
      expression: "document.querySelector('#case-name').value",
      returnByValue: true,
    },
  );
  if (writtenValue.result?.value !== "fixture operator input")
    throw new Error(
      "fixture R1 execution did not update the controlled textbox",
    );
  const staleStart = await cdp(panel.webSocketDebuggerUrl, "Runtime.evaluate", {
    expression: `(async () => await chrome.runtime.sendMessage({kind:'START_ACT', tool:'set_text_by_ref', ref_id:${JSON.stringify(textTarget.ref_id)} }))()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (staleStart.result?.value?.state !== "AWAITING_VALUE")
    throw new Error("stale-target fixture action did not create a value slot");
  await cdp(fixturePage.webSocketDebuggerUrl, "Runtime.evaluate", {
    expression:
      "document.querySelector('label[for=case-name]').textContent = 'Changed case name'",
  });
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  const staleSubmit = await cdp(
    panel.webSocketDebuggerUrl,
    "Runtime.evaluate",
    {
      expression: `(async () => await chrome.runtime.sendMessage({kind:'SUBMIT_ACTION_VALUE', run_id:${JSON.stringify(staleStart.result.value.run_id)}, value_slot_id:${JSON.stringify(staleStart.result.value.value_slot_id)}, value_kind:${JSON.stringify(staleStart.result.value.value_kind)}, value:'stale fixture input'}))()`,
      awaitPromise: true,
      returnByValue: true,
    },
  );
  if (staleSubmit.result?.value?.code !== "TARGET_STALE")
    throw new Error("stale target accepted a value-slot delivery");
  const changedControls = await cdp(
    fixturePage.webSocketDebuggerUrl,
    "Runtime.evaluate",
    {
      expression:
        "({priority: document.querySelector('#priority').value, notify: document.querySelector('#notify').checked, approve: document.querySelector('#approve').checked})",
      returnByValue: true,
    },
  );
  if (
    changedControls.result?.value?.priority !== "high" ||
    changedControls.result?.value?.notify !== true ||
    changedControls.result?.value?.approve !== true
  )
    throw new Error(
      "fixture select or checkbox did not perform the expected state transition",
    );
  await cdp(fixturePage.webSocketDebuggerUrl, "Runtime.evaluate", {
    expression: "document.querySelector('button').textContent = 'Submit'",
  });
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  const refreshed = await cdp(panel.webSocketDebuggerUrl, "Runtime.evaluate", {
    expression:
      "(async () => await chrome.runtime.sendMessage({kind:'START_PREVIEW'}))()",
    awaitPromise: true,
    returnByValue: true,
  });
  const refreshedButton = refreshed.result?.value?.snapshot?.nodes?.find(
    (node) => node.role === "button" && node.name === "Submit",
  );
  if (!refreshedButton || refreshedButton.ref_id === originalButton.ref_id) {
    throw new Error("dynamic DOM replacement did not revoke the stale ref");
  }
  await cdp(fixturePage.webSocketDebuggerUrl, "Page.navigate", {
    url: "https://fixture.company.test:8443/replaced-document",
  });
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  const navigated = await cdp(panel.webSocketDebuggerUrl, "Runtime.evaluate", {
    expression:
      "(async () => await chrome.runtime.sendMessage({kind:'START_PREVIEW'}))()",
    awaitPromise: true,
    returnByValue: true,
  });
  const navigatedSnapshot = navigated.result?.value?.snapshot;
  if (
    !navigatedSnapshot ||
    navigatedSnapshot.document_epoch === snapshot.document_epoch ||
    !navigatedSnapshot.nodes?.some(
      (node) => node.role === "button" && node.name === "Save",
    )
  ) {
    throw new Error("navigation did not replace the document-scoped identity");
  }
  await cdp(version.webSocketDebuggerUrl, "Target.closeTarget", {
    targetId: worker.id,
  });
  const afterRestart = await cdp(
    panel.webSocketDebuggerUrl,
    "Runtime.evaluate",
    {
      expression:
        "(async () => await chrome.runtime.sendMessage({kind:'START_PREVIEW'}))()",
      awaitPromise: true,
      returnByValue: true,
    },
  );
  if (afterRestart.result?.value?.ok !== true)
    throw new Error("worker restart did not re-register the live document");
  let restartedWorker;
  while (Date.now() < deadline) {
    const targets = await (
      await fetch(`http://127.0.0.1:${cdpPort}/json/list`)
    ).json();
    restartedWorker = targets.find(
      (target) =>
        target.type === "service_worker" &&
        target.url.endsWith("/js/service-worker.js") &&
        target.id !== worker.id,
    );
    if (restartedWorker) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  if (!restartedWorker) throw new Error("service worker did not restart");
  console.log("Chrome for Testing preview E2E passed");
} finally {
  if (child) {
    child.kill("SIGTERM");
    await new Promise((resolveClose) => child.once("close", resolveClose));
  }
  if (fixture) await new Promise((resolveClose) => fixture.close(resolveClose));
  await rm(certificateDirectory, { recursive: true, force: true });
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 100,
  });
}
