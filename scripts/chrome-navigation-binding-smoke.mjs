import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createS1Fixture } from "./chrome-s1-fixture.mjs";
import { openS19Chrome } from "./chrome-s19-harness.mjs";
import { evaluate, cdp, sleep } from "./chrome-cdp-utils.mjs";
import { s21BuildHash } from "./chrome-s21-ui.mjs";

const cert = await mkdtemp(join(tmpdir(), "contextpilot-navigation-binding-"));
const fixture = await createS1Fixture(
  cert,
  '<!doctype html><main><h1>Reference binding fixture</h1><a href="/approved">Approved destination</a></main>',
);
const harness = await openS19Chrome({
  executable: process.env.CHROME_FOR_TESTING_BIN,
  fixture,
});
try {
  const endpoint = new URL(harness.version.webSocketDebuggerUrl);
  const targets = await fetch(`http://${endpoint.host}/json/list`).then((r) =>
    r.json(),
  );
  const worker = targets.find(
    (target) =>
      target.type === "service_worker" &&
      target.url.endsWith("/js/service-worker.js"),
  );
  const send = async (message) => {
    await evaluate(
      worker,
      `(()=>{globalThis.__navigationBindingReply=undefined;(async()=>{const tabs=await chrome.tabs.query({active:true,lastFocusedWindow:true});const tab=tabs[0];globalThis.__navigationBindingTab=tab;try{await chrome.tabs.sendMessage(tab.id,{kind:"CONTENT_DOCUMENT_CONTEXT"})}catch{await chrome.scripting.executeScript({target:{tabId:tab.id},files:["js/content.js"]})}const reply=await chrome.tabs.sendMessage(tab.id,${JSON.stringify(message)});globalThis.__navigationBindingReply=JSON.stringify(reply)})().catch(e=>globalThis.__navigationBindingReply=JSON.stringify({error:String(e),tab:globalThis.__navigationBindingTab}));return true})()`,
    );
    for (let i = 0; i < 50; i++) {
      const reply = await evaluate(
        worker,
        "globalThis.__navigationBindingReply",
      );
      if (reply) return JSON.parse(reply);
      await sleep(100);
    }
    throw new Error("Content reply missing");
  };
  const results = [];
  for (const change of ["href", "base"]) {
    await cdp(harness.page.webSocketDebuggerUrl, "Page.navigate", {
      url: `https://s1.fixture.test:${fixture.fixturePort}/`,
    });
    await cdp(harness.version.webSocketDebuggerUrl, "Target.activateTarget", {
      targetId: harness.fixtureTarget.targetId,
    });
    await sleep(600);
    const observed = await send({ kind: "CONTENT_SNAPSHOT", scope: "all_dom" });
    assert.ok(observed.ok, JSON.stringify(observed));
    const snapshot = observed.snapshot.snapshot;
    const target = snapshot.nodes.find((node) => node.role === "link");
    assert.ok(target);
    await evaluate(
      harness.page,
      change === "href"
        ? "document.querySelector('a').href='/different';true"
        : "(()=>{const base=document.createElement('base');base.href='https://different.fixture.test/';document.head.append(base);return true})()",
    );
    const result = await send({
      kind: "CONTENT_EXECUTE_R1",
      intent: {
        tool: "navigate",
        run_id: "fixture-binding-abcdefghijkl",
        tab_id: 1,
        frame_id: 0,
        document_epoch: snapshot.document_epoch,
        ref_id: target.ref_id,
        profile: { id: "fixture", version: 1 },
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.dispatch, "not_dispatched");
    assert.ok(["TARGET_STALE", "TARGET_NOT_ACTIONABLE"].includes(result.code));
    assert.equal(await evaluate(harness.page, "location.pathname"), "/");
    results.push({
      change,
      dispatch: result.dispatch,
      code: result.code,
      navigation_blocked: true,
    });
  }
  const report = {
    issue: "ISS-20261011-004",
    scope:
      "controlled Chrome Content executor; direct Worker message, no provider/approval UI",
    build: await s21BuildHash(),
    results,
  };
  if (process.env.NAVIGATION_EVIDENCE_PATH)
    await writeFile(
      process.env.NAVIGATION_EVIDENCE_PATH,
      JSON.stringify(report, null, 2) + "\n",
    );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await harness.close();
  await new Promise((resolve) => fixture.fixture.close(resolve));
  await rm(cert, { recursive: true, force: true });
}
