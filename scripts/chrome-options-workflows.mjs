import assert from "node:assert/strict";
import { evaluate, waitFor } from "./chrome-cdp-utils.mjs";
export const checkOptionsWorkflows = async (settings, checks) => {
  await evaluate(
    settings,
    `(()=>{const send=chrome.runtime.sendMessage.bind(chrome.runtime);window.__workflowFail=false;window.__workflowUpdates=0;chrome.runtime.sendMessage=m=>{if(m.kind==='WORKFLOW_CATALOG_LIST')return window.__workflowFail?Promise.reject(new Error('offline')):Promise.resolve({ok:true,records:[{id:'fixture-workflow',title:'Fixture workflow',enabled:true,origin:'https://fixture.example',path_prefix:'/very/long/path/for/a/controlled/workflow/with/multiple/segments',declaration:{steps:[{}]}}]});if(m.kind==='WORKFLOW_CATALOG_UPDATE'){window.__workflowUpdates++;return Promise.resolve({ok:false})}return send(m)};location.hash='automation';document.querySelector('#workflow-refresh').click();return true})()`,
  );
  await waitFor(
    () =>
      evaluate(
        settings,
        "document.querySelector('.workflow-row input[type=checkbox]')!==null",
      ),
    5000,
    "WORKFLOW_ROW",
  );
  await evaluate(
    settings,
    "document.querySelector('.workflow-row input[type=checkbox]').click()",
  );
  await waitFor(
    () =>
      evaluate(
        settings,
        "document.querySelector('#workflow-records-status').value.includes('실패')",
      ),
    5000,
    "WORKFLOW_FAILURE",
  );
  assert.equal(
    await evaluate(
      settings,
      "document.querySelector('.workflow-row input[type=checkbox]').checked",
    ),
    true,
  );
  assert.equal(
    await evaluate(
      settings,
      "document.querySelector('.workflow-row input[type=checkbox]').disabled",
    ),
    false,
  );
  await evaluate(
    settings,
    "document.querySelector('.workflow-row .danger-button').click()",
  );
  assert.equal(await evaluate(settings, "window.__workflowUpdates"), 1);
  await evaluate(
    settings,
    "window.__workflowFail=true;document.querySelector('#workflow-refresh').click()",
  );
  await waitFor(
    () =>
      evaluate(
        settings,
        "document.querySelector('#workflow-records-status').value.includes('불러오지 못했습니다')",
      ),
    5000,
    "WORKFLOW_LIST_FAILURE",
  );
  await evaluate(
    settings,
    "window.__workflowFail=false;document.querySelector('#workflow-refresh').click()",
  );
  await waitFor(
    () =>
      evaluate(
        settings,
        "document.querySelector('#workflow-records-status').value===''",
      ),
    5000,
    "WORKFLOW_RETRY",
  );
  checks.push(
    "workflow mutation failure visible, toggle rolls back, controls recover, cancelled delete sends no mutation, failed list can retry",
  );
};
