import { cdp, evaluate, waitFor } from "./chrome-cdp-utils.mjs";

export const checkS2Lifecycle = async ({
  panel,
  page,
  tabId,
  fixturePort,
  firstPreview,
  attached,
  version,
  worker,
  cdpPort,
}) => {
  const conflictRef = firstPreview.snapshot.nodes.find(
    (node) => node.name === "Save D",
  )?.ref_id;
  if (!conflictRef) throw new Error("S2_CONFLICT_TARGET_MISSING");
  const conflictSetup = await evaluate(
    panel,
    `chrome.debugger.attach({tabId:${tabId}}, '1.3').then(() => true)`,
  );
  if (conflictSetup !== true) throw new Error("S2_CONFLICT_SETUP_FAILED");
  try {
    const conflict = await evaluate(
      panel,
      `chrome.runtime.sendMessage(${JSON.stringify({
        kind: "START_ACT",
        tool: "click_by_ref",
        ref_id: conflictRef,
      })})`,
    );
    if (conflict?.code !== "CDP_CONFLICT")
      throw new Error(`S2_CONFLICT_NOT_CLOSED: ${conflict?.code}`);
    if (
      (await evaluate(
        page,
        "document.querySelector('#save-d').dataset.trusted ?? ''",
      )) !== ""
    )
      throw new Error("S2_CONFLICT_DISPATCHED_INPUT");
  } finally {
    await evaluate(
      panel,
      `chrome.debugger.detach({tabId:${tabId}}).then(() => true)`,
    );
  }
  if (await attached(panel, tabId)) throw new Error("CONFLICT_DETACH_LEAK");

  await cdp(page.webSocketDebuggerUrl, "Page.navigate", {
    url: `https://s1.fixture.test:${fixturePort}/next`,
  });
  const next = await waitFor(
    async () => {
      const result = await evaluate(
        panel,
        "chrome.runtime.sendMessage({kind:'START_PREVIEW'})",
      ).catch(() => undefined);
      return result?.snapshot?.document_epoch !==
        firstPreview.snapshot.document_epoch
        ? result
        : undefined;
    },
    10_000,
    "S2_NAVIGATION_NOT_REGISTERED",
  );
  const oldRef = firstPreview.snapshot.nodes.find(
    (node) => node.name === "Save A",
  )?.ref_id;
  const stale = await evaluate(
    panel,
    `chrome.runtime.sendMessage(${JSON.stringify({
      kind: "START_ACT",
      tool: "click_by_ref",
      ref_id: oldRef,
    })})`,
  );
  if (stale?.code !== "TARGET_NOT_ACTIONABLE")
    throw new Error(`NAVIGATION_REF_REUSED: ${stale?.code}`);
  if (await attached(panel, tabId)) throw new Error("NAVIGATION_ATTACH_LEAK");

  // The harness creates an extension-owned debug session and marker to test
  // restart recovery. Product code still uses its closed command builders.
  const markerKey = `contextpilot_cdp_marker_${tabId}`;
  const injected = await evaluate(
    panel,
    `(async () => {
      await chrome.debugger.attach({tabId:${tabId}}, '1.3');
      await chrome.storage.session.set({${JSON.stringify(markerKey)}:{
        tabId:${tabId}, runId:'s2-recovery', actionId:'s2-recovery', phase:'attached'
      }});
      return true;
    })()`,
  );
  if (injected !== true || !(await attached(panel, tabId)))
    throw new Error("S2_RECOVERY_SETUP_FAILED");
  await cdp(version.webSocketDebuggerUrl, "Target.closeTarget", {
    targetId: worker.id,
  });
  await waitFor(
    () =>
      evaluate(panel, "chrome.runtime.sendMessage({kind:'START_PREVIEW'})")
        .then((result) => result?.ok === true)
        .catch(() => false),
    10_000,
    "S2_WORKER_RECOVERY_FAILED",
  );
  await waitFor(
    async () => {
      const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then(
        (response) => response.json(),
      );
      return targets.some(
        (target) =>
          target.type === "service_worker" &&
          target.url.endsWith("/js/service-worker.js") &&
          target.id !== worker.id,
      );
    },
    10_000,
    "S2_WORKER_NOT_RESTARTED",
  );
  await waitFor(
    async () => {
      const stored = await evaluate(
        panel,
        `chrome.storage.session.get(${JSON.stringify(markerKey)})`,
      );
      return !(await attached(panel, tabId)) && stored?.[markerKey] === null;
    },
    10_000,
    "S2_OWNED_DEBUGGER_NOT_CLEANED",
  );
  const revoked = await evaluate(
    panel,
    "chrome.runtime.sendMessage({kind:'PERMISSION_REVOKE_ALL'})",
  );
  if (revoked?.ok !== true) throw new Error("S2_PERMISSION_REVOKE_FAILED");
  const currentRef = next.snapshot.nodes.find(
    (node) => node.name === "Save A",
  )?.ref_id;
  const afterRevoke = await evaluate(
    panel,
    `chrome.runtime.sendMessage(${JSON.stringify({
      kind: "START_ACT",
      tool: "click_by_ref",
      ref_id: currentRef,
    })})`,
  );
  if (afterRevoke?.state !== "PERMISSION_REQUIRED")
    throw new Error(`S2_REVOKED_GRANT_REUSED: ${afterRevoke?.code}`);
  if (await attached(panel, tabId)) throw new Error("S2_REVOKE_ATTACH_LEAK");
  return next;
};
