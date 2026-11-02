import assert from "node:assert/strict";
import { evaluate, cdp, waitFor } from "../chrome-cdp-utils.mjs";
export async function qualifyMainHelpers(worker, page, tabId, frame) {
  const documentId = frame.documentId;
  const run = async (body) => {
    const value = await evaluate(
      worker,
      `(async()=>{const h=globalThis.__s28MainHelpers;let milliseconds=5000;const target={tabId:${tabId},documentIds:[${JSON.stringify(documentId)}]};const inject=async(name,args=[],world='MAIN')=>{if(world==='ISOLATED'){const [value]=await chrome.scripting.executeScript({target,world,func:h[name],args});return value.result??null;}return (await globalThis.__s28InjectMain(chrome,{tabId:${tabId},frameId:0,binding:${JSON.stringify(frame)},deadline:Date.now()+milliseconds,signal:new AbortController().signal,current:()=>true,beforeDispatch(){}},h[name],args))??null;};${body}})().then(value=>({ok:true,value})).catch(error=>({ok:false,error:String(error)}))`,
    );
    assert.equal(value?.ok, true, JSON.stringify(value));
    return value.value;
  };
  const names = await run("return Object.keys(h).sort()");
  assert.deepEqual(names, [
    "discoverPageMethodsMain",
    "installPageMethodRegistryMain",
    "invokeFixturePageApi",
    "invokePageMethodMain",
    "probeFixturePageApi",
    "readFixturePageApi",
  ]);
  assert.equal(await run("return inject('probeFixturePageApi')"), true);
  assert.equal(
    await run("return inject('probeFixturePageApi',[],'ISOLATED')"),
    false,
  );
  assert.deepEqual(
    await run("return inject('readFixturePageApi',['summary'])"),
    {
      records: [{ category: "Fixture", count: 3 }],
      total: 1,
      eof: true,
    },
  );
  assert.equal(await run("return inject('readFixturePageApi',['bad'])"), null);
  assert.equal(
    await run(
      "return inject('invokeFixturePageApi',['fixture_variant','select_variant','medium'])",
    ),
    "called",
  );
  assert.equal(await evaluate(page, "variant"), "medium");
  assert.equal(
    await run(
      "return inject('invokeFixturePageApi',['fixture_variant','select_variant','invalid'])",
    ),
    "invalid",
  );
  const registry = "__contextPilotMethods_s28_emitted";
  assert.equal(
    await run(
      `return inject('installPageMethodRegistryMain',[${JSON.stringify(registry)}])`,
    ),
    true,
  );
  const discover = () =>
    run(
      `return inject('discoverPageMethodsMain',[${JSON.stringify(registry)}])`,
    );
  const methods = await discover();
  assert.ok(methods.length > 0 && methods.length <= 48);
  const find = (list, name) =>
    list.find((m) => m.object_path.join(".") === `fixtureApp.${name}`);
  const add = find(methods, "add"),
    descriptor = find(methods, "descriptor");
  assert.ok(add && descriptor);
  const invoke = (method, args) =>
    run(
      `return inject('invokePageMethodMain',${JSON.stringify([method.object_path, method.locator_revision, method.method_name, method.arity, args, registry])})`,
    );
  assert.deepEqual(await invoke(add, [4]), {
    status: "returned",
    kind: "json",
    value: 5,
    truncated: false,
    unsupported: false,
  });
  assert.deepEqual(await invoke(descriptor, []), {
    status: "returned",
    kind: "json",
    value: { safe: "ok" },
    truncated: true,
    unsupported: false,
  });
  assert.equal(await evaluate(page, "fixtureGetters"), 0);
  assert.equal(await evaluate(page, "fixtureCalls"), 2);
  await evaluate(
    page,
    "fixtureApp.add=function add(amount){fixtureCalls++;return amount+2};true",
  );
  assert.deepEqual(await invoke(add, [4]), { status: "stale" });
  assert.equal(await evaluate(page, "fixtureCalls"), 2);
  const fresh = find(await discover(), "add");
  assert.notEqual(fresh.locator_revision, add.locator_revision);
  assert.equal((await invoke(fresh, [4])).value, 6);
  assert.deepEqual(
    await run(
      `return inject('invokePageMethodMain',[['__proto__'],'old','add',1,[],${JSON.stringify(registry)}])`,
    ),
    { status: "invalid" },
  );
  await evaluate(
    page,
    "appData.readSummary=async()=>({records:Array.from({length:201},()=>({category:'Fixture',count:1})),total:201,eof:true});true",
  );
  assert.equal(
    await run("return inject('readFixturePageApi',['summary'])"),
    null,
  );
  await evaluate(
    page,
    "Object.defineProperty(window,'demoControls',{configurable:true,get(){fixtureGetters++;throw Error('accessor')}});true",
  );
  assert.equal(await run("return inject('probeFixturePageApi')"), false);
  assert.equal(await evaluate(page, "fixtureGetters"), 0);
  await evaluate(page, "appData.readSummary=async()=>new Promise(()=>{});true");
  const stalled = await run(
    "milliseconds=50;try{await inject('readFixturePageApi',['summary']);return {timedOut:false}}catch(error){return {timedOut:error.message==='MAIN_INJECTION_UNCERTAIN',dispatched:error.dispatched}}",
  );
  assert.deepEqual(stalled, { timedOut: true, dispatched: true });
  await cdp(page.webSocketDebuggerUrl, "Page.navigate", {
    url: "https://page-api-fixture.invalid/other",
  });
  await waitFor(
    () =>
      evaluate(
        page,
        "location.pathname==='/other' && document.readyState==='complete'",
      ),
    5000,
    "NEW_MAIN_DOCUMENT",
  );
  const staleDocument = await run(
    `try{await inject('probeFixturePageApi');return {denied:false}}catch(error){return {denied:error.message==='MAIN_INJECTION_DENIED',dispatched:error.dispatched}}`,
  );
  assert.deepEqual(staleDocument, { denied: true, dispatched: false });
  return {
    exports: names,
    emittedFunctionsSerialized: true,
    mainIsolatedSeparation: true,
    fixtureApiReadAndInvoke: true,
    invalidOptionDenied: true,
    discoveryBounded: true,
    replacementIdentityRejected: true,
    freshIdentityAccepted: true,
    accessorsNotInvoked: true,
    resultBounds: true,
    staleDocumentDenied: true,
    stalledMainBounded: true,
    fixtureCalls: 3,
    businessDispatches: 0,
  };
}
