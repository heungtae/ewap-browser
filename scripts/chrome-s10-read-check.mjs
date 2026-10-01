import assert from "node:assert/strict";
import { build } from "esbuild";
import { cp } from "node:fs/promises";
import { resolve } from "node:path";
import { evaluate } from "./chrome-cdp-utils.mjs";

/** A supplemental test module; production artifacts and runtime routes are unchanged. */
export const prepareS10ReadHarness = async (directory) => {
  await cp(resolve("dist-extension"), directory, { recursive: true });
  await build({
    stdin: {
      contents: `
    import {createPageApiReadRunner} from './extension/src/service-worker/page-api-read-runner.ts';
    import {PermissionManager} from './extension/src/policy/permission-manager.ts';
    import {createManagedEnterprisePolicy} from './extension/src/service-worker/enterprise-policy-runtime.ts';
    const permissions=new PermissionManager();
    const policy=createManagedEnterprisePolicy(chrome);
    const current=async(tabId)=>{
      const tab=await chrome.tabs.get(tabId);
      const [document]=await chrome.scripting.executeScript({target:{tabId},world:'ISOLATED',func:()=>true});
      const scope=await chrome.tabs.sendMessage(tabId,{kind:'CONTENT_COLLECTION_CONTEXT'});
      return {document_id:document.documentId,document_epoch:scope.document_epoch,page_scope_epoch:scope.page_scope_epoch,origin:new URL(tab.url).origin,path:new URL(tab.url).pathname};
    };
    const runner=createPageApiReadRunner({scripting:chrome.scripting,current,authorize:async(binding,capability,risk)=>{
      if(permissions.check(capability,binding.origin,binding.run_id)!=='ALLOW')return false;
      const result=await policy.authorize({run_id:binding.run_id,tab_id:binding.tab_id,document_epoch:binding.document_epoch,origin:binding.origin,capability,risk,profile:{id:'fixture',version:1}});
      return result.decision==='ALLOW';
    }});
    export const binding=async(run)=>{
      const tabs=await chrome.tabs.query({});const tab=tabs.find(item=>item.url?.startsWith('https://page-api-fixture.invalid/'));
      return {run_id:run,tab_id:tab.id,...await current(tab.id),adapter_id:'fixture_summary',adapter_version:1,option_id:'summary'};
    };
    export const grant=(binding,capability)=>permissions.decide(capability,binding.origin,binding.run_id,'once');
    export const read=runner.read;
  `,
      resolveDir: process.cwd(),
      loader: "ts",
    },
    bundle: true,
    format: "esm",
    target: "chrome116",
    outfile: resolve(directory, "js/s10-read-harness.js"),
  });
};

export const checkS10Read = async ({ panel, page }) => {
  await evaluate(
    panel,
    "import(chrome.runtime.getURL('js/s10-read-harness.js')).then(module => {window.s10Read=module;return true;})",
  );
  await evaluate(
    panel,
    "s10Read.binding('read-denied').then(binding => {window.s10Binding=binding;s10Read.grant(binding,'page_api');return true;})",
  );
  const baseline = await evaluate(page, "readCount");
  assert.deepEqual(await evaluate(panel, "s10Read.read(s10Binding)"), {
    ok: false,
    code: "POLICY_DENIED",
  });
  assert.equal(
    await evaluate(page, "readCount"),
    baseline,
    "action permission granted read authority",
  );
  await evaluate(
    panel,
    "s10Read.binding('read-approved').then(binding => {window.s10Binding=binding;s10Read.grant(binding,'page_api_read');return true;})",
  );
  const result = await evaluate(panel, "s10Read.read(s10Binding)");
  assert.deepEqual(result, {
    ok: true,
    context: {
      source: { kind: "page_api_read", label: "reviewed page summary" },
      coverage: "complete",
      collected_count: 2,
      records: [
        { index: 0, cells: ["North", "12"] },
        { index: 1, cells: ["South", "9"] },
      ],
      truncated: false,
    },
  });
  assert.equal(await evaluate(page, "readCount"), baseline + 1);
  assert.deepEqual(await evaluate(panel, "s10Read.read(s10Binding)"), {
    ok: false,
    code: "POLICY_DENIED",
  });
  await evaluate(
    page,
    "appData.readSummary=async()=>{readCount++;return {records:[{category:'North',count:1,token:'S10_SECRET_TOKEN'}],total:1,eof:true};};true",
  );
  await evaluate(
    panel,
    "s10Read.binding('read-invalid').then(binding => {window.s10Binding=binding;s10Read.grant(binding,'page_api_read');return true;})",
  );
  const invalid = await evaluate(panel, "s10Read.read(s10Binding)");
  assert.deepEqual(invalid, { ok: false, code: "PAGE_API_CONTRACT_INVALID" });
  assert.equal(JSON.stringify(invalid).includes("S10_SECRET_"), false);
  await evaluate(
    panel,
    "s10Read.binding('read-stale').then(binding => {window.s10Binding=binding;s10Read.grant(binding,'page_api_read');return true;})",
  );
  await evaluate(
    page,
    "history.pushState({},'',location.pathname+'?read-scope');true",
  );
  await evaluate(
    panel,
    "chrome.tabs.sendMessage(s10Binding.tab_id,{kind:'CONTENT_SNAPSHOT',scope:'all_dom'})",
  );
  assert.deepEqual(await evaluate(panel, "s10Read.read(s10Binding)"), {
    ok: false,
    code: "PAGE_SCOPE_STALE",
  });
  console.log(
    "S10 read-only adapter Chrome passed: separate R0 permission, real MAIN/document binding, closed context, no retry, schema and scope rejection",
  );
};
