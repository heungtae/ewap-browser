import { liveProviderConfig } from "./live-provider-config.mjs";
import { s17ProviderReply } from "./chrome-s17-provider-fixture.mjs";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, cp, rm } from "node:fs/promises";
import {
  cdp,
  evaluate,
  reservePort,
  waitFor,
  sleep,
} from "./chrome-cdp-utils.mjs";
import { openAnalysisPanel } from "./chrome-analysis-panel.mjs";
import { checkDiagnosticsZip } from "./chrome-diagnostics-zip-check.mjs";
import { createS1Fixture } from "./chrome-s1-fixture.mjs";
import assert from "node:assert/strict";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import {
  exampleRequests,
  checkReading,
} from "./chrome-example-request-cases.mjs";
const documented = await exampleRequests();
const s17Suite = process.env.S17_SUITE === "1";
const s15Suite = process.env.S15_SUITE === "1";
const liveModel = process.env.S15_LIVE_MODEL;
const live = liveProviderConfig(liveModel);
const upstreamTimeout = s17Suite
  ? Number(process.env.S17_UPSTREAM_TIMEOUT_MS ?? 60000)
  : 60000;
if (
  !Number.isSafeInteger(upstreamTimeout) ||
  upstreamTimeout < 1000 ||
  upstreamTimeout > 120000
)
  throw Error("Invalid S17_UPSTREAM_TIMEOUT_MS");
const readingSuite = process.env.EXAMPLE_REQUEST_SUITE === "reading";
const root = resolve(".");
const executable = process.env.CHROME_FOR_TESTING_BIN;
if (!executable)
  throw Error("CHROME_FOR_TESTING_BIN must point to Chrome for Testing");
const output = process.env.ACCESSIBLE_ITEMS_REPORT;
const targetUrl = process.env.ACCESSIBLE_ITEMS_URL || undefined;
const headful = process.env.CHROME_HEADED === "1";
const profile = await mkdtemp(
  join(tmpdir(), "contextpilot-accessible-profile-"),
);
// Clone only an explicitly supplied test profile, never run in the original.
if (process.env.ACCESSIBLE_ITEMS_TEST_PROFILE) {
  await cp(process.env.ACCESSIBLE_ITEMS_TEST_PROFILE, profile, {
    recursive: true,
  });
  for (const path of [
    "Default/Service Worker",
    "Default/Code Cache",
    "Default/Cache",
    "Default/Extension Scripts",
    "SingletonLock",
    "SingletonSocket",
    "SingletonCookie",
  ])
    await rm(join(profile, path), { recursive: true, force: true });
}
const cert = await mkdtemp(join(tmpdir(), "contextpilot-accessible-cert-"));
let current;
const calls = [];
const results = [];
const stream = (response, delta, finishReason) => {
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "access-control-allow-origin": "*",
  });
  response.end(
    `data: ${JSON.stringify({ choices: [{ delta, ...(finishReason ? { finish_reason: finishReason } : {}) }] })}\n\ndata: [DONE]\n\n`,
  );
};
const fixture = await createS1Fixture(
  cert,
  readingSuite
    ? async (url) => {
        const file = current?.file ?? documented.reading[0].file;
        if (
          file.includes("page-api") &&
          url.split("?")[0] === "/external-fixture.js"
        )
          return await readFile(
            "examples/page-api-discovery-demo/external-fixture.js",
            "utf8",
          );
        const html = await readFile(file, "utf8");
        return !file.includes("page-api")
          ? html
          : html +
              `<script>window.__exampleCalls=0;for(const name of ['appData','gridApi','demoControls']){const descriptors=Object.getOwnPropertyDescriptors(window[name]);for(const d of Object.values(descriptors)){if(typeof d.value==='function'){const original=d.value;d.value=function(...args){window.__exampleCalls++;return original.apply(this,args)}}if(d.get){const original=d.get;d.get=function(){window.__exampleCalls++;return original.call(this)}}}window[name]=Object.defineProperties({},descriptors)}</script>`;
      }
    : (await readFile("examples/accessible-items-demo/index.html", "utf8"))
        .replaceAll(s15Suite ? "Notes" : "__unused__", "Draft annotation")
        .replaceAll(s15Suite ? 'id="notes"' : "__unused_id__", 'id="memo"')
        .replaceAll(s15Suite ? 'for="notes"' : "__unused_for__", 'for="memo"'),
  async (req, res, body) => {
    const system = body.messages?.[0]?.content ?? "";
    const projection = body.messages
      ?.map((m) => (typeof m.content === "string" ? m.content : ""))
      .join("\n")
      .match(
        /\[UNTRUSTED_PAGE_PROJECTION\]\n([^]*?)\n\[\/UNTRUSTED_PAGE_PROJECTION\]/,
      );
    const nodes = projection ? JSON.parse(projection[1]).nodes : [];
    calls.push({
      clarificationAnswerPresent: body.messages?.some(
        (m) =>
          typeof m.content === "string" &&
          m.content.includes("User clarification answer"),
      ),
      case: current.id,
      promptMatches: body.messages?.some(
        (m) =>
          typeof m.content === "string" && m.content.includes(current.prompt),
      ),
      analysis: (() => {
        const match = body.messages
          ?.map((m) => m.content ?? "")
          .join("\n")
          .match(
            /\[UNTRUSTED_ANALYSIS_DATA\]\n([^]*?)\n\[\/UNTRUSTED_ANALYSIS_DATA\]/,
          );
        return match ? JSON.parse(match[1]) : undefined;
      })(),
      tools: body.tools?.map((t) => t.function.name) ?? [],
      nodes: nodes.map((n) => ({
        name: n.name,
        role: n.role,
        visible: n.visible,
        enabled: n.enabled,
        state: n.state,
      })),
      secret: JSON.stringify(body).includes("not-projected"),
    });
    const callRecord = calls.at(-1);
    if (s15Suite || s17Suite) {
      const block = [...(body.messages ?? [])]
        .reverse()
        .find((message) =>
          message.content?.startsWith("[UNTRUSTED_EXECUTION_INVENTORY]"),
        );
      const inventory = block
        ? JSON.parse(block.content.split("\n")[1])
        : undefined;
      callRecord.planApproved = inventory?.plan?.approved;
      callRecord.planCompletedSteps = inventory?.plan?.completed_steps;
      callRecord.executionOutcomes = inventory?.execution_evidence?.map(
        (item) => item.outcome,
      );
      callRecord.resultCallIds = body.messages
        ?.filter((message) => message.role === "tool")
        .map((message) => message.tool_call_id);
    }
    if (liveModel) {
      const upstreamStarted = Date.now();
      try {
        const upstream = await fetch(live.endpoint, {
          method: "POST",
          headers: live.headers,
          body: JSON.stringify({
            ...body,
            model: liveModel,
            ...(live.provider === "openrouter" &&
            s17Suite &&
            process.env.S17_LIVE_REASONING === "off"
              ? { reasoning: { enabled: false } }
              : {}),
            ...live.parameters,
            stream: false,
          }),
          signal: AbortSignal.timeout(upstreamTimeout),
        });
        if (s17Suite)
          callRecord.reasoningMode =
            live.provider === "openai"
              ? "none"
              : process.env.S17_LIVE_REASONING === "off"
                ? "disabled"
                : "provider-default";
        if (s17Suite) callRecord.upstreamTimeoutMs = upstreamTimeout;
        callRecord.upstreamProvider = live.provider;
        callRecord.upstreamStatus = upstream.status;
        if (s17Suite)
          console.log(
            `S17 live request ${calls.length}: HTTP ${upstream.status}`,
          );
        if (!upstream.ok) {
          const failure = await upstream.json().catch(() => ({}));
          callRecord.upstreamReason = failure.error?.message;
          callRecord.upstreamDetail = failure.error?.metadata?.raw;
          throw Error(`LIVE_PROVIDER_HTTP_${upstream.status}`);
        }
        const result = await upstream.json();
        callRecord.upstreamElapsedMs = Date.now() - upstreamStarted;
        callRecord.model = result.model;
        callRecord.finishReason = result.choices[0].finish_reason;
        callRecord.responseText = result.choices[0].message.content;
        callRecord.responseTools =
          result.choices[0].message.tool_calls?.map((c) => c.function.name) ??
          [];
        callRecord.responseCallIds =
          result.choices[0].message.tool_calls?.map((call) => call.id) ?? [];
        const goalCall = result.choices[0].message.tool_calls?.find(
          (call) => call.function.name === "report_goal_status",
        );
        if (goalCall) {
          try {
            callRecord.goalStatus = JSON.parse(
              goalCall.function.arguments,
            ).status;
          } catch {
            callRecord.goalStatus = "invalid-json";
          }
        }
        if (s15Suite || s17Suite) {
          callRecord.proposalFacts = (
            result.choices[0].message.tool_calls ?? []
          )
            .filter((call) => call.function.name.startsWith("propose_"))
            .map((call) => {
              let args;
              try {
                args = JSON.parse(call.function.arguments);
              } catch {
                return {
                  validJson: false,
                  argumentLength: call.function.arguments.length,
                };
              }
              return {
                validJson: true,
                keys: Object.keys(args),
                approvalScope: args.approval_scope,
                valueType: typeof args.value,
                valueLength:
                  typeof args.value === "string"
                    ? args.value.length
                    : undefined,
                sourceRevisionType: typeof args.value_source_revision,
                valueMatchesRequest: args.value === current.value,
                callIdLength: call.id.length,
              };
            });
        }
        if (
          s17Suite &&
          result.choices[0].message.tool_calls?.[0]?.function.name ===
            "submit_plan"
        ) {
          const args = JSON.parse(
            result.choices[0].message.tool_calls[0].function.arguments,
          );
          const invBlock = [...body.messages]
            .reverse()
            .find((message) =>
              message.content?.startsWith("[UNTRUSTED_EXECUTION_INVENTORY]"),
            );
          const inv = invBlock
            ? JSON.parse(invBlock.content.split("\n")[1])
            : undefined;
          callRecord.planSchemaFacts = {
            revisionType: typeof args.request_revision,
            revisionMatches: args.request_revision === inv?.request_revision,
            evidenceMatches: args.evidence_ids?.includes(inv?.observation_id),
            scopeAccepted: args.approval_scope === "single_step",
            stepCount: args.steps?.length,
            capabilitiesOffered: args.steps?.map((step) =>
              inv?.actions.some((action) => action.name === step.capability),
            ),
          };
        }
        if (s17Suite)
          console.log(
            `S17 live tools: ${callRecord.responseTools.join(",") || "answer"}`,
          );
        return stream(
          res,
          result.choices[0].message,
          result.choices[0].finish_reason,
        );
      } catch (error) {
        callRecord.upstreamError = String(error);
        if (s17Suite) console.log(`S17 live upstream failure: ${error.name}`);
        res.writeHead(502, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: String(error) }));
      }
    }
    if (s17Suite) {
      const reply = s17ProviderReply(body, current);
      if (reply) return stream(res, reply);
    }
    if (current.clarify && current.proposed)
      return stream(res, { content: "Fixture action complete" });
    if (
      current.clarify &&
      !current.asked &&
      !system.includes("Classify the user's browser request")
    ) {
      current.asked = true;
      return stream(res, {
        tool_calls: [
          {
            id: "test-question-abcdefghijkl",
            type: "function",
            function: {
              name: "request_clarification",
              arguments: JSON.stringify({
                question: "어떤 검색값을 입력할까요?",
                value_kind: "text",
              }),
            },
          },
        ],
      });
    }
    if (system.includes("Classify the user's browser request"))
      return stream(res, { content: '{"route":"ACTION_REQUIRED"}' });
    if (current.multiple) {
      if ((current.proposals ?? 0) >= 2)
        return stream(res, { content: "Fixture action complete" });
      current.target = current.proposals ? "Draft annotation" : "Search query";
      current.value = current.proposals ? "second 'quoted'" : "first ⟪holdout⟫";
    }
    if (current.mode === "ask")
      return stream(res, {
        content:
          "Fixture read complete: " +
          (readingSuite
            ? JSON.stringify(calls.at(-1).analysis ?? {}) + " "
            : "") +
          nodes
            .filter((n) => !n.hidden)
            .map((n) => n.name)
            .join(", "),
      });
    if (
      !current.workflow &&
      body.messages?.some(
        (m) =>
          m.role === "tool" &&
          (!s17Suite ||
            m.content?.includes("ACTION_RESULT_NOT_GOAL_COMPLETION")),
      ) &&
      !current.clarify &&
      !current.multiple
    ) {
      // Harness read loop coverage: after grounding reads, fall through to
      // the proposal once. Any other read-only turn ends as an answer.
      if (current.readFirst && !current.proposed) current.proposed = true;
      else return stream(res, { content: "Fixture action complete" });
    }
    if (current.readFirst && !current.readDone) {
      current.readDone = true;
      return stream(res, {
        tool_calls: [
          {
            id: "test-read-abcdefghijkl",
            type: "function",
            function: { name: "read_page", arguments: "{}" },
          },
        ],
      });
    }
    if (current.workflow) {
      const preview = nodes.find((n) => n.name === "Generate preview");
      const tools = body.tools ?? [];
      // Harness suitability review turn: the runner offers read tools plus
      // submit_review before any step tool. The controlled double answers
      // the review from the known case fit instead of reasoning.
      if (tools.some((t) => t.function.name === "submit_review")) {
        const fits = current.id === "workflow";
        return stream(res, {
          tool_calls: [
            {
              id: "test-review-abcdefghijkl",
              type: "function",
              function: {
                name: "submit_review",
                arguments: JSON.stringify({
                  verdict: fits ? "match" : "mismatch",
                  rationale: fits
                    ? "Preview request matches the Preview workflow candidate."
                    : "Search input request does not match the Preview workflow candidate.",
                  missing: [],
                }),
              },
            },
          ],
        });
      }
      if (tools.some((t) => t.function.name === "propose_select_option")) {
        current.target = "Report scope";
        current.role = "combobox";
        current.tool = "propose_select_option";
        current.args = { value: "Detailed" };
      } else if (tools.some((t) => t.function.name === "propose_set_checked")) {
        current.target = "Include detailed results";
        current.role = "checkbox";
        current.tool = "propose_set_checked";
        current.args = { checked: true };
      } else if (
        preview &&
        tools.some((t) => t.function.name === "propose_click")
      ) {
        current.target = "Generate preview";
        current.role = "button";
        current.tool = "propose_click";
        current.args = {};
      } else return stream(res, { content: "Workflow complete" });
    }
    const node = nodes.find(
      (n) => n.name === current.target && n.role === current.role,
    );
    const tool = body.tools?.find((t) => t.function.name === current.tool);
    if (!node || !tool) {
      return stream(res, {
        content:
          "Fixture cannot propose this target/tool in current projection",
      });
    }
    // PAH-9: controlled text proposals carry the LLM-judged value with its
    // source revision so the approved value types without an extra card.
    const args = {
      target: node.model_ref,
      approval_scope: "single_step",
      approval_reason: "Execute this controlled local fixture test.",
      ...current.args,
      ...(current.tool === "propose_set_text" && current.value !== undefined
        ? {
            value: current.value,
            value_source_revision: 1,
          }
        : {}),
    };
    if (current.clarify) current.proposed = true;
    if (current.multiple) current.proposals = (current.proposals ?? 0) + 1;
    stream(res, {
      tool_calls: [
        {
          id: `test-proposal-${calls.length}-abcdefghijkl`,
          type: "function",
          function: { name: current.tool, arguments: JSON.stringify(args) },
        },
      ],
    });
  },
);
const port = await reservePort();
const child = spawn(
  executable,
  [
    ...(headful ? ["--ozone-platform=x11"] : ["--headless=new"]),
    "--window-size=1440,1100",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--ignore-certificate-errors",
    "--host-resolver-rules=MAP s1.fixture.test 127.0.0.1",
    `--user-data-dir=${profile}`,
    `--load-extension=${root}/dist-extension`,
    `--disable-extensions-except=${root}/dist-extension`,
    `--remote-debugging-port=${port}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);
try {
  const version = await waitFor(
    () =>
      fetch(`http://127.0.0.1:${port}/json/version`)
        .then((r) => r.json())
        .catch(() => undefined),
    10000,
    "CHROME_READY",
  );
  const targets = () =>
    fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
  const worker = await waitFor(
    async () =>
      (await targets()).find(
        (t) =>
          t.type === "service_worker" &&
          t.url.endsWith("/js/service-worker.js"),
      ),
    15000,
    "WORKER_READY",
  );
  const expectedVersion = JSON.parse(
    await readFile("extension/manifest.json", "utf8"),
  ).version;
  const loadedVersion = await waitFor(
    () =>
      evaluate(worker, "chrome.runtime.getManifest().version").catch(
        () => undefined,
      ),
    15000,
    "Worker execution context did not initialize",
  );
  assert.equal(
    loadedVersion,
    expectedVersion,
    "Chrome loaded the wrong extension version",
  );
  console.log(`Extension ${loadedVersion}`);
  const extensionId = new URL(worker.url).host;
  const fixtureTarget = await cdp(
    version.webSocketDebuggerUrl,
    "Target.createTarget",
    {
      url:
        targetUrl ?? `https://s1.fixture.test:${fixture.fixturePort}/#controls`,
    },
  );
  const page = await waitFor(
    async () => (await targets()).find((t) => t.id === fixtureTarget.targetId),
    10000,
    "PAGE_READY",
  );
  const { panel, panelWindowId } = await openAnalysisPanel({
    cdpPort: port,
    extensionId,
    fixtureTarget,
    version,
    worker,
  });
  if (s15Suite)
    await evaluate(
      panel,
      `(()=>{const original=chrome.runtime.sendMessage.bind(chrome.runtime);window.__s15Replies=[];chrome.runtime.sendMessage=async message=>{const result=await original(message);if((message.payload?.kind??message.kind).startsWith('ACT_'))window.__s15Replies.push({kind:message.payload?.kind??message.kind,ok:result?.ok,code:result?.code});return result};return true})()`,
    );
  if (s15Suite)
    await evaluate(
      panel,
      `(()=>{window.__s15Downloads=[];const original=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{blob.arrayBuffer().then(b=>window.__s15Downloads.push(Array.from(new Uint8Array(b))));return original(blob)};HTMLAnchorElement.prototype.click=function(){};return true})()`,
    );
  const send = (m) =>
    evaluate(panel, `chrome.runtime.sendMessage(${JSON.stringify(m)})`);
  if (targetUrl?.startsWith("http:")) {
    const origin = new URL(targetUrl).origin + "/*";
    const granted = await cdp(panel.webSocketDebuggerUrl, "Runtime.evaluate", {
      expression: `chrome.permissions.request({origins:[${JSON.stringify(origin)}]})`,
      userGesture: true,
      awaitPromise: true,
      returnByValue: true,
    });
    if (granted.result?.value !== true)
      throw Error("HTTP host permission denied in the isolated test profile");
  }
  const save = await send({
    kind: "PROVIDER_SAVE",
    payload: {
      id: "fixture",
      config: {
        plugin_id: "contextpilot.openai-compatible",
        plugin_version: "1.0.0",
        label: "Controlled local tests",
        base_url: `https://s1.fixture.test:${fixture.fixturePort}/v1`,
        wire_api: "chat_completions",
        model: "fixture",
        api_key: "",
        api_key_header: "none",
        headers: [],
        timeout_ms: liveModel ? upstreamTimeout + 30000 : 15000,
        enabled: true,
      },
    },
  });
  if (!save?.ok) throw Error("PROVIDER_SAVE " + JSON.stringify(save));

  const click = async (selector) => {
    const bounds = await evaluate(
      page,
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
    );
    for (const type of ["mousePressed", "mouseReleased"])
      await cdp(page.webSocketDebuggerUrl, "Input.dispatchMouseEvent", {
        type,
        ...bounds,
        button: "left",
        clickCount: 1,
      });
  };
  const state = () =>
    readingSuite
      ? evaluate(
          page,
          "({controls:[...document.querySelectorAll('input,select,textarea,button')].map(e=>({value:e.value,checked:e.checked,disabled:e.disabled})),scroll:[scrollX,scrollY],fixtureCalls:window.__exampleCalls??0})",
        )
      : evaluate(
          page,
          "({search:document.querySelector('#search').value,notes:document.querySelector('#notes,#memo').value,scope:document.querySelector('#report-scope').value,checked:document.querySelector('#include-details').checked,disabled:document.querySelector('#preview').disabled,result:document.querySelector('#result').textContent.trim(),activity:document.querySelector('#activity-tab').getAttribute('aria-selected'),menu:document.querySelector('#menu-button').getAttribute('aria-expanded'),dialog:document.querySelector('#confirmation-dialog').open,details:document.querySelector('#more-details').open})",
        );
  const button = async (text) =>
    evaluate(
      panel,
      `(()=>{const cards=[...document.querySelectorAll('.event-card')].filter(e=>e.dataset.testSeen!=='1');for(const card of cards){const b=[...card.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(text)})&&!b.disabled);if(b){card.dataset.testSeen='1';b.click();return true}}return false})()`,
    );
  const cases = [
    {
      id: "read",
      mode: "ask",
      prompt: "이 페이지의 입력 필드와 버튼, 현재 선택 상태를 알려줘.",
    },
    {
      id: "search",
      target: "Search query",
      role: "textbox",
      tool: "propose_set_text",
      value: "browser test",
      prompt: "Search query에 browser test를 입력해줘.",
    },
    {
      id: "notes",
      target: "Notes",
      role: "textbox",
      tool: "propose_set_text",
      value: "테스트 메모",
      prompt: "Notes에 테스트 메모를 입력해줘.",
      // Covers the harness read loop: first turn reads, second proposes.
      readFirst: true,
    },
    {
      id: "scope",
      target: "Report scope",
      role: "combobox",
      tool: "propose_select_option",
      args: { value: "Detailed" },
      prompt: "Report scope를 Detailed로 선택해줘.",
    },
    {
      id: "checkbox",
      target: "Include detailed results",
      role: "checkbox",
      tool: "propose_set_checked",
      args: { checked: true },
      prompt: "Include detailed results를 체크해줘.",
    },
    {
      id: "disabled-preview",
      target: "Generate preview",
      role: "button",
      tool: "propose_click",
      prompt: "Generate preview를 눌러줘.",
    },
    {
      id: "preview",
      target: "Generate preview",
      role: "button",
      tool: "propose_click",
      prepare: async () => {
        await evaluate(
          page,
          "(()=>{const s=document.querySelector('#report-scope');s.value='detailed';s.dispatchEvent(new Event('change',{bubbles:true}));return true})()",
        );
        await click("#include-details");
      },
      prompt: "Generate preview를 눌러줘.",
    },
    {
      id: "workflow",
      workflow: true,
      target: "Report scope",
      role: "combobox",
      tool: "propose_select_option",
      args: { value: "Detailed" },
      prompt: "Generate local preview 워크플로우를 실행해줘.",
    },
    {
      id: "deny",
      deny: true,
      target: "Search query",
      role: "textbox",
      tool: "propose_set_text",
      value: "deny test",
      prompt: "Search query에 deny test를 입력해줘.",
    },
    {
      id: "tab",
      target: "Activity",
      role: "tab",
      tool: "propose_click",
      prompt: "Activity 탭을 선택해줘.",
    },
    {
      id: "menu",
      target: "Open local menu",
      role: "button",
      tool: "propose_click",
      prompt: "Open local menu를 눌러줘.",
    },
    {
      id: "reviewed",
      target: "Mark reviewed",
      role: "menuitem",
      tool: "propose_click",
      prepare: () => click("#menu-button"),
      prompt: "Mark reviewed를 눌러줘.",
    },
    {
      id: "dialog-open",
      target: "Open confirmation dialog",
      role: "menuitem",
      tool: "propose_click",
      prepare: () => click("#menu-button"),
      prompt: "Open confirmation dialog를 눌러줘.",
    },
    {
      id: "dialog-close",
      target: "Close dialog",
      role: "button",
      tool: "propose_click",
      prepare: async () => {
        await click("#menu-button");
        await click("#open-dialog");
      },
      prompt: "Close dialog를 눌러줘.",
    },
    {
      id: "disclosure",
      prepare: () =>
        evaluate(
          page,
          "document.querySelector('#more-details summary').scrollIntoView({block:'center'})",
        ),
      target: "Open additional visible text",
      role: "button",
      tool: "propose_click",
      prompt: "Open additional visible text를 펼쳐줘.",
    },
    {
      id: "disabled-action",
      prepare: () =>
        evaluate(
          page,
          "[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Disabled action').scrollIntoView({block:'center'})",
        ),
      target: "Disabled action",
      role: "button",
      tool: "propose_click",
      prompt: "Disabled action을 눌러줘.",
    },
    { id: "password", mode: "ask", prompt: "Account password 값을 알려줘." },
  ];
  cases.push(
    {
      id: "controls-link",
      target: "Controls",
      role: "link",
      tool: "propose_navigate",
      prompt: documented.accessible[17].prompt,
      prepare: () =>
        evaluate(
          page,
          "(()=>{location.hash='#states';scrollTo(0,0);return true})()",
        ),
    },
    {
      id: "states-link",
      prepare: () => evaluate(page, "scrollTo(0,0)"),
      target: "State examples",
      role: "link",
      tool: "propose_navigate",
      prompt: documented.accessible[18].prompt,
    },
    {
      id: "external-link",
      prepare: () => evaluate(page, "scrollTo(0,0)"),
      target: "External example",
      role: "link",
      tool: "propose_navigate",
      prompt: documented.accessible[19].prompt,
    },
  );
  for (let i = 0; i < cases.length; i++)
    assert.equal(cases[i].prompt, documented.accessible[i].prompt);
  const s15Cases = [
    { ...cases.find((c) => c.id === "search") },
    {
      ...cases.find((c) => c.id === "notes"),
      readFirst: false,
      target: "Draft annotation",
      value: "holdout ‘서울’ / 42",
      prompt:
        "Draft annotation에 다음 문자열 그대로 써 주세요: holdout ‘서울’ / 42",
    },
    {
      ...cases.find((c) => c.id === "search"),
      id: "clarification",
      clarify: true,
      value: "followup search",
      prompt: "검색을 하고 싶어.",
    },
    {
      ...cases.find((c) => c.id === "search"),
      id: "long-value",
      value: "a".repeat(512) + "middle-visible" + "z".repeat(584),
      prompt:
        "Search query에 다음 문자열을 정확하게 입력해줘: " +
        "a".repeat(512) +
        "middle-visible" +
        "z".repeat(584),
    },
    {
      ...cases.find((c) => c.id === "search"),
      id: "multiple",
      multiple: true,
      prompt:
        "Search query에 first ⟪holdout⟫, Draft annotation에 second 'quoted'를 각각 입력해줘.",
    },
    { ...cases.find((c) => c.id === "deny") },
  ];
  if (process.env.S15_INPUT_CLARIFICATION_CASE === "1")
    s15Cases.push({
      ...s15Cases.find((item) => item.id === "clarification"),
      id: "clarification-input",
      prompt:
        "Search query 입력란에 검색어를 입력해줘. 검색 실행은 하지 말고 값 입력만 요청해.",
    });
  const s17DocumentCase = {
    ...cases.find((item) => item.id === "states-link"),
    id: "document-link",
    prepare: async () => {
      await evaluate(
        page,
        "(()=>{const link=[...document.querySelectorAll('a')].find(item=>item.textContent.trim()==='State examples');link.href='/next';scrollTo(0,0);return true})()",
      );
    },
  };
  const s17AsyncCase = {
    ...cases.find((item) => item.id === "preview"),
    id: "async-preview",
    prepare: async () => {
      await cases.find((item) => item.id === "preview").prepare();
      await evaluate(
        page,
        "(()=>{document.querySelector('#preview').addEventListener('click',event=>{event.stopImmediatePropagation();setTimeout(()=>{document.querySelector('#result').textContent='Preview generated for Detailed.'},400)},true);return true})()",
      );
    },
  };
  const s17Cases = [
    s17DocumentCase,
    s17AsyncCase,
    ...s15Cases.filter((item) =>
      ["search", "multiple", "deny"].includes(item.id),
    ),
    ...cases.filter((item) =>
      ["controls-link", "states-link", "preview"].includes(item.id),
    ),
  ];
  const suiteCases = s17Suite
    ? s17Cases
    : s15Suite
      ? s15Cases
      : readingSuite
        ? documented.reading
        : cases;
  const selectedCases = process.env.ACCESSIBLE_ITEMS_CASES
    ? suiteCases.filter((item) =>
        process.env.ACCESSIBLE_ITEMS_CASES.split(",").includes(item.id),
      )
    : suiteCases;
  for (current of selectedCases) {
    if (s17Suite && liveModel)
      current.prompt +=
        " 먼저 submit_plan으로 전체 요청의 단계와 정확한 입력값을 검토하도록 제출해줘. 계획 승인 이후에도 각 동작의 승인을 기다리고, 마지막 실행 결과와 최신 관찰을 받은 뒤 report_goal_status로 원래 요청 전체의 완료 여부를 판단해줘.";
    let evidence;
    let clarificationBeforeAnswer;
    try {
      await send({ kind: "CANCEL" });
      await send({ kind: "CHAT_CLEAR" });
      await send({ kind: "PERMISSION_REVOKE_ALL" });
      await cdp(page.webSocketDebuggerUrl, "Page.navigate", {
        url: readingSuite
          ? `https://s1.fixture.test:${fixture.fixturePort}${current.path}?case=${current.id}`
          : (targetUrl ??
            `https://s1.fixture.test:${fixture.fixturePort}/?case=${current.id}#controls`),
        ignoreCache: true,
      });
      await sleep(1000);
      if (current.prepare) await current.prepare();
      await cdp(version.webSocketDebuggerUrl, "Target.activateTarget", {
        targetId: fixtureTarget.targetId,
      });
      await evaluate(
        panel,
        "document.querySelectorAll('.event-card').forEach(e=>e.dataset.testSeen='1')",
      );
      const goalFeedbackBefore = s17Suite
        ? await evaluate(
            panel,
            "document.querySelector('#chat-messages').textContent.split('모델이 목표 완료').length",
          )
        : 0;
      const before = await state();
      const start = calls.length;
      await evaluate(
        panel,
        `(()=>{document.querySelector('#mode-${current.mode ?? "act"}').click();document.querySelector('#chat-input').value=${JSON.stringify(current.prompt)};document.querySelector('#chat-form').requestSubmit();return true})()`,
      );
      let acted = false;
      let approvalCount = 0;
      let planApprovalCount = 0;
      let planReviewObserved = false;
      let dismissed = false;
      let selected = false;
      let value = false;
      let fullReviewObserved = false;
      const deadline = Date.now() + (liveModel ? 300000 : 60000);
      for (let i = 0; Date.now() < deadline; i++) {
        await sleep(150);
        if (current.workflow) {
          if (!selected) selected = await button("Generate local preview");
          else await button("분석 시작");
        } else if (!dismissed) {
          dismissed = await button("일반 한 단계 실행");
        }
        if (s15Suite && current.id === "long-value" && !acted) {
          fullReviewObserved ||= await evaluate(
            panel,
            `[...document.querySelectorAll('.event-card[data-kind=review]')].some(e=>e.textContent.includes(${JSON.stringify(current.value)}))`,
          );
        }
        if (s15Suite || s17Suite)
          planReviewObserved ||= await evaluate(
            panel,
            "[...document.querySelectorAll('.event-card[data-kind=review]')].some(e=>e.dataset.testSeen!=='1' && e.textContent.includes('이 승인은 동작을 실행하지 않습니다'))",
          );
        if ((s15Suite || s17Suite) && (await button("계획 승인"))) {
          approvalCount++;
          planApprovalCount++;
        }
        if (await button("이번 단계 실행")) {
          acted = true;
          approvalCount++;
        }
        await button("확인하고 실행");
        if (current.deny) await button("거부");
        else await button("이번만 허용");
        if (readingSuite) {
          if (
            current.boundary &&
            (await evaluate(
              panel,
              "[...document.querySelectorAll('.event-card')].some(e=>e.dataset.testSeen!=='1' && e.textContent.includes('분석할 데이터 선택'))",
            ))
          ) {
            current.boundarySelectionObserved = true;
            await send({ kind: "CANCEL" });
            await evaluate(
              panel,
              "document.querySelectorAll('.event-card').forEach(e=>e.dataset.testSeen='1')",
            );
          }
          await button("이번 요청에서 허용");
          if (current.selection && (await button(current.selection)))
            current.selectionHandled = true;
          if (current.selection && !current.selectionHandled)
            current.selectionHandled = await evaluate(
              panel,
              `(()=>{const card=[...document.querySelectorAll('.event-card')].find(e=>e.dataset.testSeen!=='1' && e.textContent.includes('분석할 데이터 선택'));if(!card)return false;const buttons=[...card.querySelectorAll('button')].filter(b=>!b.disabled);const b=${current.path === "/mixed-collections.html" ? "buttons.find(b=>b.textContent.includes('" + (current.selection === "Feature requests" ? "15" : "20") + "'))" : "buttons[0]"};if(!b)return false;card.dataset.testSeen='1';b.click();return true})()`,
            );
        }
        if (s15Suite && !current.clarify) {
          assert.equal(
            await evaluate(
              panel,
              "[...document.querySelectorAll('.event-card[data-kind=value]')].filter(e=>e.dataset.testSeen!=='1').length",
            ),
            0,
            "Explicit value must not require reentry",
          );
        }
        if (
          current.clarify &&
          !value &&
          (await evaluate(
            panel,
            "[...document.querySelectorAll('.event-card[data-kind=value]')].some(e=>e.dataset.testSeen!=='1')",
          ))
        )
          clarificationBeforeAnswer = await state();
        if (current.value && !value)
          value = await evaluate(
            panel,
            `(()=>{const card=[...document.querySelectorAll('.event-card[data-kind=value]')].find(e=>e.dataset.testSeen!=='1');const form=card?.querySelector('form');if(!form)return false;card.dataset.testSeen='1';form.querySelector('input,textarea').value=${JSON.stringify(current.value)};form.requestSubmit();return true})()`,
          );
        const done = await evaluate(
          panel,
          "document.querySelector('#chat-send')?.dataset.state==='send'",
        );
        const pending = await evaluate(
          panel,
          "[...document.querySelectorAll('.event-card')].some(e=>e.dataset.testSeen!=='1' && ['review','permission','value','confirmation'].includes(e.dataset.kind) && [...e.querySelectorAll('button')].some(b=>!b.disabled))",
        );
        const workflowDone =
          !current.workflow ||
          (await state()).result === "Preview generated for Detailed.";
        // A plan approval closes one run before its next provider turn starts.
        // The transient idle state is not the S17 request's final feedback.
        const s17Finished =
          !s17Suite ||
          current.deny ||
          (await evaluate(
            panel,
            `document.querySelector('#chat-messages').textContent.split('모델이 목표 완료').length>${goalFeedbackBefore} || [...document.querySelectorAll('.event-card[data-kind=error]')].some(e=>e.dataset.testSeen!=='1')`,
          ));
        const s15LiveFinished =
          !s15Suite ||
          !liveModel ||
          current.deny ||
          (await evaluate(
            panel,
            "[...document.querySelectorAll('.event-card[data-kind=error]')].some(e=>e.dataset.testSeen!=='1')",
          )) ||
          calls
            .slice(start)
            .some(
              (call) =>
                call.executionOutcomes?.length === (current.multiple ? 2 : 1) &&
                (call.responseTools?.length === 0 ||
                  call.responseTools?.includes("report_goal_status")),
            );
        if (
          done &&
          !pending &&
          workflowDone &&
          s17Finished &&
          s15LiveFinished &&
          i > 20
        )
          break;
      }
      let diagnosticZipRedacted;
      if (s15Suite) {
        const baseline = await evaluate(panel, "window.__s15Downloads.length");
        await evaluate(
          panel,
          "document.querySelector('#diagnostics-export').click()",
        );
        const bytes = await waitFor(
          () =>
            evaluate(
              panel,
              `window.__s15Downloads.length>${baseline}?window.__s15Downloads.at(-1):null`,
            ),
          10000,
          "S15_DIAGNOSTICS_ZIP",
        );
        const zipText = JSON.stringify(checkDiagnosticsZip(bytes));
        diagnosticZipRedacted = (
          current.multiple
            ? ["first ⟪holdout⟫", "second 'quoted'"]
            : [current.value ?? "__unused__"]
        ).every((value) => !zipText.includes(value));
      }
      const recovered = s15Suite
        ? await send({ kind: "CHAT_RECOVER" })
        : undefined;
      const after = await state();
      const ui = await evaluate(
        panel,
        "({busy:document.querySelector('#chat-send')?.dataset.state,cards:[...document.querySelectorAll('.event-card')].filter(e=>e.dataset.testSeen!=='1').map(e=>({kind:e.dataset.kind,title:e.querySelector('b')?.textContent,detail:e.dataset.kind==='error'?e.querySelector('.event-detail')?.textContent:undefined})).slice(-8)})",
      );
      const result = {
        id: current.id,
        prompt: current.prompt,
        boundarySelectionObserved: current.boundarySelectionObserved,
        selectionHandled: current.selectionHandled,
        before,
        after,
        acted,
        approvalCount,
        ...(s15Suite || s17Suite
          ? { planReviewObserved, planApprovalCount }
          : {}),
        valueCardAnswered: value,
        ...(clarificationBeforeAnswer
          ? {
              clarificationBeforeAnswerUnchanged:
                JSON.stringify(clarificationBeforeAnswer) ===
                JSON.stringify(before),
            }
          : {}),
        fullReviewObserved,
        diagnosticZipRedacted,
        ...(s17Suite
          ? {
              goalFeedbackVisible: await evaluate(
                panel,
                `document.querySelector('#chat-messages').textContent.split('모델이 목표 완료').length>${goalFeedbackBefore}`,
              ),
            }
          : {}),
        eventSummary: recovered?.events?.map((e) => ({
          type: e.type,
          run: e.run_id,
          code: e.code,
          tool: e.action?.tool,
        })),
        replies: s15Suite
          ? await evaluate(panel, "window.__s15Replies")
          : undefined,
        provider: liveModel ?? "controlled",
        workflowSelected: selected,
        calls: calls.slice(start),
        ui,
      };
      evidence = result;
      if (s15Suite && liveModel && current.clarify) {
        assert.equal(result.clarificationBeforeAnswerUnchanged, true);
        const question = result.calls.find((call) =>
          call.responseTools?.includes("request_clarification"),
        );
        assert.ok(question, "Live clarification tool missing");
        assert.ok(
          result.calls.some(
            (call) =>
              call.clarificationAnswerPresent &&
              question.responseCallIds.some((id) =>
                call.resultCallIds?.includes(id),
              ),
          ),
          "Clarification result must return under the same call ID",
        );
      }
      if (s15Suite)
        assert.equal(
          diagnosticZipRedacted,
          true,
          current.id + ": raw value in diagnostic ZIP",
        );
      if (s17Suite && !current.deny) {
        assert.ok(result.planReviewObserved, "Plan approval UI missing");
        assert.ok(
          result.calls.some((call) => call.planApproved === true),
          "Plan approval did not return to model",
        );
        assert.ok(
          result.calls.some(
            (call) =>
              call.tools.includes("report_goal_status") &&
              call.executionOutcomes?.length === (current.multiple ? 2 : 1),
          ),
          "Final execution feedback missing",
        );
        assert.equal(
          result.goalFeedbackVisible,
          true,
          "Goal completion UI missing",
        );
      }
      if (
        s15Suite &&
        liveModel &&
        result.calls.some((call) => call.goalStatus === "incomplete")
      ) {
        assert.ok(
          result.eventSummary.some(
            (event) =>
              event.type === "run_terminal" && event.code === "GOAL_INCOMPLETE",
          ),
          "Incomplete goal must retain its typed reason",
        );
        assert.ok(
          result.calls.some(
            (call) =>
              call.executionOutcomes?.length > 0 &&
              call.executionOutcomes.every((outcome) => outcome === "VERIFIED"),
          ),
          "Incomplete goal must not hide failed execution",
        );
        assert.ok(
          ui.cards.some(
            (item) =>
              item.kind === "info" && item.title.includes("목표에 남은 작업"),
          ),
          "Remaining goal must be visible",
        );
      }
      const blocked = ["disabled-preview", "disabled-action"].includes(
        current.id,
      );
      assert.equal(ui.busy, "send", current.id + ": panel did not settle");
      if (!blocked && current.id !== "external-link")
        assert.equal(
          ui.cards.filter((c) => c.kind === "error").length,
          0,
          current.id + ": unexpected error",
        );
      const expected = {
        "controls-link": async () =>
          (await evaluate(page, "location.hash")) === "#controls",
        "states-link": async () =>
          (await evaluate(page, "location.hash")) === "#states",
        "external-link": async () =>
          (await targets()).some(
            (t) => t.type === "page" && t.url.startsWith("https://example.com"),
          ),
        search: () => after.search === current.value,
        multiple: () =>
          approvalCount === 2 + planApprovalCount &&
          after.search === "first ⟪holdout⟫" &&
          after.notes === "second 'quoted'",
        clarification: () => value && acted && after.search === current.value,
        "clarification-input": () =>
          value && acted && after.search === current.value,
        "long-value": () =>
          fullReviewObserved && after.search === current.value,
        notes: () => after.notes === current.value,
        scope: () => after.scope === "detailed",
        checkbox: () => after.checked === true,
        "document-link": async () =>
          (await evaluate(page, "location.pathname")) === "/next",
        "async-preview": () =>
          after.result === "Preview generated for Detailed.",
        preview: () => after.result === "Preview generated for Detailed.",
        workflow: () =>
          selected &&
          after.scope === "detailed" &&
          after.checked &&
          after.result === "Preview generated for Detailed.",
        deny: () => after.search === "" && acted,
        tab: () => after.activity === "true",
        menu: () => after.menu === "true",
        reviewed: () => after.result === "Local item marked reviewed.",
        "dialog-open": () => after.dialog === true,
        "dialog-close": () => after.dialog === false && before.dialog === true,
        disclosure: () => after.details === true,
        "disabled-preview": () =>
          !acted && after.disabled && after.result === before.result,
        "disabled-action": () =>
          !acted && JSON.stringify(before) === JSON.stringify(after),
        read: () =>
          calls
            .slice(start)
            .some(
              (c) =>
                c.nodes.some((n) => n.name === "Search query") &&
                c.nodes.some((n) => n.name === "Disabled action" && !n.enabled),
            ),
        password: () =>
          calls.slice(start).some((c) => c.nodes.length) &&
          calls
            .slice(start)
            .every(
              (c) =>
                !c.secret && !c.nodes.some((n) => /password|otp/i.test(n.name)),
            ),
      };
      if (readingSuite)
        checkReading(current, calls.slice(start), before, after);
      else
        assert.equal(
          await expected[current.id](),
          true,
          current.id + ": expected page state missing",
        );
      result.pass = true;
      results.push(result);
      console.log(current.id + " PASS");
      if (ui.busy !== "send")
        await evaluate(panel, "document.querySelector('#chat-send').click()");
    } catch (e) {
      if ((current.workflow || s15Suite || s17Suite) && output) {
        const diagnostics = await evaluate(
          panel,
          `chrome.runtime.sendMessage(${JSON.stringify({ kind: "PANEL_REQUEST", window_id: panelWindowId, payload: { schema_version: 1, kind: "DIAGNOSTICS_BUNDLE_EXPORT" } })})`,
        );
        await writeFile(
          output + ".workflow-trace.json",
          JSON.stringify(
            diagnostics?.data?.sections?.execution_trace ?? diagnostics,
            null,
            2,
          ),
        );
      }
      results.push({
        ...evidence,
        id: current.id,
        prompt: current.prompt,
        pass: false,
        error: String(e),
      });
      console.log(current.id, "FAIL", String(e));
    }
    if (output) await writeFile(output, JSON.stringify(results, null, 2));
  }
  assert.equal(results.length, selectedCases.length);
  assert.equal(
    results.filter((r) => r.pass === true).length,
    selectedCases.length,
    JSON.stringify(
      results.filter((r) => !r.pass).map((r) => ({ id: r.id, error: r.error })),
    ),
  );
  console.log(
    `${readingSuite ? "Example reading" : "Accessible items"}: all ${selectedCases.length} real Chrome Side Panel cases passed (${liveModel ? `live ${live.provider}/${liveModel}` : "controlled provider"})`,
  );
} finally {
  child.kill("SIGTERM");
  await new Promise((r) => child.once("close", r));
  await new Promise((r) => fixture.fixture.close(r));
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
  await rm(cert, { recursive: true, force: true, maxRetries: 3 });
}
