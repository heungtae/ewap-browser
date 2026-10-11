import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createS1Fixture } from "./chrome-s1-fixture.mjs";
import { openS19Chrome } from "./chrome-s19-harness.mjs";
import { cdp, evaluate, sleep, waitFor } from "./chrome-cdp-utils.mjs";
import { liveProviderConfig } from "./live-provider-config.mjs";
import { parseTool } from "./chrome-s19-fixture.mjs";

const model = process.env.S23_LIVE_MODEL;
const live = liveProviderConfig(model);
const reportPath = process.env.S23_REPORT ?? "/tmp/s23-page-method.json";
const fixtureSecret = "S23_PRIVATE_TOKEN_91ab";
const prompt =
  "페이지 script를 읽고 페이지가 제공하는 합산 메서드와 사용법을 확인한 뒤 2와 5를 전달해 계산해줘. 소스 근거가 확인된 메서드 하나만 호출하고, 반환 결과와 페이지 효과 검증을 구분해서 결과를 알려줘.";
const methodScript = `window.methodCallCount=0;
window.reportTools={
  mergeFigures:async function mergeFigures(left,right){
    window.methodCallCount++;
    return {sum:left+right};
  }
};
const api_key="${fixtureSecret}";`;
const pageHtml = `<!doctype html><title>Script method holdout</title><main><h1>Report calculator</h1><p>Ready</p></main><script src="/report-tools.js"></script>`;
const state = { id: "merge-holdout", n: 0, prompt };
const calls = [];
const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const controlled = (body, current) => {
  const tool = (name) =>
    body.tools?.find((item) => item.function.name === name);
  const call = (name, args) => ({
    content: "",
    tool_calls: [
      {
        id: `s23-call-${++current.n}-abcdefghijklmnop`,
        type: "function",
        function: { name, arguments: JSON.stringify(args) },
      },
    ],
  });
  if (body.messages[0]?.content?.includes("Classify the user"))
    return { content: '{"route":"ACTION_REQUIRED"}' };

  const results = body.messages
    .filter((message) => message.role === "tool")
    .map((message) => ({
      id: message.tool_call_id,
      value: parseTool(message.content),
    }));
  const readSchema = tool("read_page_resource");
  const source = results.findLast(
    (item) =>
      item.value.status === "AVAILABLE" &&
      item.value.content?.text?.includes("mergeFigures"),
  );
  if (readSchema && !source) {
    const search = results.findLast((item) => Array.isArray(item.value.hits));
    if (search?.value.hits?.length) {
      const hit = search.value.hits[0];
      return call("read_page_resource", {
        resource_id: hit.resource_id,
        resource_revision: hit.resource_revision,
        offset: hit.byte_offset,
        max_bytes: 4096,
      });
    }
    const inventory = results.findLast((item) =>
      Array.isArray(item.value.items),
    );
    const script = inventory?.value.items.find(
      (item) =>
        ["inline_script", "external_script"].includes(item.kind) &&
        item.state === "AVAILABLE",
    );
    if (script)
      return call("read_page_resource", {
        resource_id: script.resource_id,
        resource_revision: script.revision,
        offset: 0,
        max_bytes: 4096,
      });
    if (!inventory) return call("list_page_resources", { page_size: 50 });
    return call("search_page_resources", {
      query: "mergeFigures",
      page_size: 8,
    });
  }
  const proposal = tool("propose_page_method_call");
  if (
    proposal &&
    !results.some((item) => item.value.invocation === "returned")
  ) {
    const source = results.findLast(
      (item) =>
        item.value.status === "AVAILABLE" &&
        item.value.content?.text?.includes("mergeFigures"),
    )?.value;
    if (!source) return { content: "Source evidence is unavailable." };
    const inventoryMessage = body.messages.findLast((message) =>
      message.content?.startsWith("[UNTRUSTED_EXECUTION_INVENTORY]"),
    );
    const inventory = JSON.parse(inventoryMessage.content.split("\n")[1]);
    const method = inventory.page_methods.find(
      (item) =>
        item.object_path.at(-1) === "mergeFigures" ||
        item.method_name === "mergeFigures",
    );
    if (!method) return { content: "The fixture method was not discovered." };
    return call("propose_page_method_call", {
      method_ref: method.method_ref,
      source_evidence_id: source.evidence_id,
      arguments: [2, 5],
      purpose: "사용자가 요청한 두 수의 합 계산",
      approval_scope: "single_step",
      approval_reason: "요청한 합산 메서드 호출",
    });
  }
  const goal = tool("report_goal_status");
  if (goal)
    return call("report_goal_status", {
      status: "completed",
      summary:
        "페이지 메서드가 반환한 합계는 7입니다. 호출 반환만 확인했고 별도의 서버 저장 효과는 주장하지 않습니다.",
      observation_id:
        goal.function.parameters.properties.observation_id.enum[0],
    });
  return {
    content: "The request cannot be completed with the available method.",
  };
};

const cert = await mkdtemp(join(tmpdir(), "contextpilot-s23-cert-"));
const fixture = await createS1Fixture(
  cert,
  async (url) =>
    new URL(url, "https://s1.fixture.test").pathname === "/"
      ? pageHtml
      : new URL(url, "https://s1.fixture.test").pathname === "/report-tools.js"
        ? methodScript
        : "",
  async (_request, response, body) => {
    assert.equal(
      JSON.stringify(body).includes(fixtureSecret),
      false,
      "private fixture value reached Provider request",
    );
    const record = {
      request_index: calls.length + 1,
      offered_tools: body.tools?.map((item) => item.function.name) ?? [],
      returned: body.messages
        .filter((message) => message.role === "tool")
        .map((message) => {
          const result = parseTool(message.content);
          assert.equal(
            message.content.includes(fixtureSecret),
            false,
            "private fixture value reached Provider",
          );
          return {
            tool_call_id: message.tool_call_id,
            status: result.status,
            keys: Object.keys(result),
            hit_count: Array.isArray(result.hits) ? result.hits.length : null,
            item_count: Array.isArray(result.items)
              ? result.items.length
              : null,
            content_keys: Object.keys(result.content ?? {}),
            invocation: result.invocation,
            dispatch: result.dispatch,
            has_return_data: result.return_data?.available === true,
            returned_expected_sum:
              result.return_data?.available === true &&
              result.return_data.value === '{"sum":7}',
            result_hash: hash(result),
          };
        }),
    };
    const inventoryMessage = body.messages.findLast((message) =>
      message.content?.startsWith("[UNTRUSTED_EXECUTION_INVENTORY]"),
    );
    if (inventoryMessage) {
      const inventory = JSON.parse(inventoryMessage.content.split("\n")[1]);
      console.log(
        `S23 inventory: ${inventory.page_method_discovery}; ${inventory.page_methods.length} methods; tools=${body.tools?.map((item) => item.function.name).join(",")}`,
      );
    }
    calls.push(record);
    let message;
    if (model) {
      const upstream = await fetch(live.endpoint, {
        method: "POST",
        headers: live.headers,
        body: JSON.stringify({
          ...body,
          model,
          ...live.parameters,
          stream: false,
        }),
        signal: AbortSignal.timeout(90_000),
      });
      record.upstream_status = upstream.status;
      if (!upstream.ok) throw Error(`UPSTREAM_HTTP_${upstream.status}`);
      message = (await upstream.json()).choices?.[0]?.message;
    } else {
      message = controlled(body, state);
    }
    console.log(
      `S23 provider turn ${record.request_index}: ${(message?.tool_calls ?? []).map((item) => item.function.name).join(",") || "answer"}`,
    );
    record.proposed = (message?.tool_calls ?? []).map((item) => ({
      id: item.id,
      name: item.function.name,
    }));
    response.writeHead(200, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    });
    response.end(JSON.stringify({ choices: [{ message }] }));
  },
);

process.env.S22_MODE = "full";
const harness = await openS19Chrome({
  executable: process.env.CHROME_FOR_TESTING_BIN,
  fixture,
  liveModel: model,
});
const results = [];
const started = Date.now();
try {
  await cdp(harness.page.webSocketDebuggerUrl, "Page.navigate", {
    url: `https://s1.fixture.test:${fixture.fixturePort}/`,
  });
  await sleep(600);
  await waitFor(
    () =>
      evaluate(
        harness.page,
        "typeof window.reportTools?.mergeFigures === 'function'",
      ),
    10000,
    "S23_FIXTURE_SCRIPT_READY",
  );
  await cdp(harness.version.webSocketDebuggerUrl, "Target.activateTarget", {
    targetId: harness.fixtureTarget.targetId,
  });
  await sleep(600);
  await evaluate(
    harness.panel,
    `(()=>{document.querySelector('#mode-act').click();document.querySelector('#chat-input').value=${JSON.stringify(prompt)};document.querySelector('#chat-form').requestSubmit();return true})()`,
  );
  const deadline = started + (model ? 240_000 : 90_000);
  let finished = false;
  while (Date.now() < deadline) {
    await sleep(150);
    const ready = await evaluate(
      harness.panel,
      "document.querySelector('#chat-send').dataset.state==='send'",
    );
    if (
      ready &&
      calls
        .flatMap((item) => item.proposed)
        .some((item) => item.name === "report_goal_status")
    ) {
      finished = await evaluate(
        harness.panel,
        "document.querySelector('#chat-messages').textContent.includes('합계는 7')",
      );
      if (finished) break;
    }
    if (
      await evaluate(
        harness.panel,
        "document.querySelectorAll('.event-card[data-kind=error]').length>0",
      )
    )
      break;
  }
  assert.equal(
    finished,
    true,
    "Provider did not report the returned page-method value",
  );
  const proposals = calls.flatMap((item) => item.proposed);
  for (const name of [
    "search_page_resources",
    "read_page_resource",
    "propose_page_method_call",
    "report_goal_status",
  ])
    assert.ok(
      proposals.some((item) => item.name === name),
      `missing ${name}`,
    );
  assert.equal(
    proposals.filter((item) => item.name === "propose_page_method_call").length,
    1,
    "Provider must propose the method once",
  );
  const methodCall = proposals.find(
    (item) => item.name === "propose_page_method_call",
  );
  const matchingResults = (calls.at(-1)?.returned ?? []).filter(
    (item) => item.tool_call_id === methodCall.id,
  );
  assert.equal(
    matchingResults.length,
    1,
    "method result must return once under its original tool_call_id",
  );
  assert.equal(matchingResults[0].dispatch, "dispatched");
  assert.equal(matchingResults[0].invocation, "returned");
  assert.equal(matchingResults[0].has_return_data, true);
  assert.equal(matchingResults[0].returned_expected_sum, true);
  assert.equal(await evaluate(harness.page, "window.methodCallCount"), 1);
  results.push({
    pass: true,
    provider: model ? live.provider : "controlled",
    model: model ?? "fixture",
    elapsed_ms: Date.now() - started,
    method_call_id: methodCall.id,
    method_result_count: matchingResults.length,
    invocation: matchingResults[0].invocation,
    dispatch: matchingResults[0].dispatch,
    page_call_count: 1,
    offered_tool_names: [
      ...new Set(calls.flatMap((item) => item.offered_tools)),
    ],
  });
  console.log(`S23 page method ${model ? "live" : "controlled"}: PASS`);
} catch (error) {
  results.push({
    pass: false,
    provider: model ? live.provider : "controlled",
    model: model ?? "fixture",
    error: error instanceof Error ? error.message : "UNKNOWN",
    calls,
    ui_errors: await evaluate(
      harness.panel,
      "[...document.querySelectorAll('.event-card[data-kind=error]')].map((card)=>card.textContent)",
    ),
  });
  process.exitCode = 1;
  console.error(
    `S23 page method: FAIL ${error instanceof Error ? error.message : "UNKNOWN"}`,
  );
} finally {
  await writeFile(reportPath, JSON.stringify(results, null, 2));
  await harness.close();
  await new Promise((resolve) => fixture.fixture.close(resolve));
  await rm(cert, { recursive: true, force: true, maxRetries: 3 });
}
