import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import {
  cdp,
  evaluate,
  reservePort,
  sleep,
  waitFor,
} from "./chrome-cdp-utils.mjs";
import { openAnalysisPanel } from "./chrome-analysis-panel.mjs";
import { createS1Fixture } from "./chrome-s1-fixture.mjs";
import { checkDiagnosticsZip } from "./chrome-diagnostics-zip-check.mjs";

const executable = process.env.CHROME_FOR_TESTING_BIN;
if (!executable) throw Error("CHROME_FOR_TESTING_BIN is required");
const profile = await mkdtemp(join(tmpdir(), "contextpilot-s16-profile-"));
const cert = await mkdtemp(join(tmpdir(), "contextpilot-s16-cert-"));
const calls = [];
const results = [];
let current;
const liveModel = process.env.S16_LIVE_MODEL;
const prompt =
  process.env.S16_PROMPT ??
  "페이지의 전체 script 리소스 목록을 빠짐없이 먼저 확인하고, script 검색과 필요한 부분 읽기를 통해 unfamiliarReportTransform을 찾아 어떤 계산인지 설명해줘. 소스는 실행하지 마.";
const secret = "S16_SOURCE_PRIVATE_7f29";
const html = `<!doctype html><title>Static source holdout</title><main><h1>Report view</h1><label for="note">Report note</label><input id="note"><button>Open report</button></main>
<script>function unfamiliarReportTransform(input) { return input.map(row => row.amount * 3); }
const api_key = "${secret}";
${"// bounded-source-padding\n".repeat(400)}</script><script src="/external.js"></script><script src="https://unsupported.invalid/denied.js"></script>`;
const fixture = await createS1Fixture(
  cert,
  async (url) =>
    url === "/external.js"
      ? "function externalReportHelper() { return 7; }"
      : liveModel
        ? html.replace(
            "<script>function",
            `${"<script>// unrelated static resource</script>".repeat(24)}<script>function`,
          )
        : html,
  async (_req, res, body) => {
    const record = {
      case: current.id,
      tools: body.tools?.map((tool) => tool.function.name) ?? [],
      returned:
        body.messages
          ?.filter((message) => message.role === "tool")
          .map((message) => ({
            id: message.tool_call_id,
            content: message.content,
          })) ?? [],
    };
    calls.push(record);
    assert.equal(
      JSON.stringify(body).includes(secret),
      false,
      "raw source secret reached Provider",
    );
    const reply = (message) => {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "access-control-allow-origin": "*",
      });
      res.end(
        `data: ${JSON.stringify({ choices: [{ delta: message }] })}\n\ndata: [DONE]\n\n`,
      );
    };
    if (liveModel) {
      const started = Date.now();
      try {
        const response = await fetch(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            },
            body: JSON.stringify({
              ...body,
              model: liveModel,
              max_tokens: 2048,
              stream: false,
            }),
            signal: AbortSignal.timeout(60_000),
          },
        );
        record.upstream_status = response.status;
        record.upstream_headers_ms = Date.now() - started;
        console.log(
          `S16 live request ${calls.length}: HTTP ${response.status}`,
        );
        if (!response.ok) {
          res.writeHead(502);
          res.end("upstream unavailable");
          return;
        }
        const result = await response.json();
        record.upstream_body_ms = Date.now() - started;
        record.model = result.model;
        record.answer = result.choices?.[0]?.message?.content;
        record.chosen_arguments =
          result.choices?.[0]?.message?.tool_calls?.map(
            (call) => call.function.arguments,
          ) ?? [];
        record.chosen_calls =
          result.choices?.[0]?.message?.tool_calls?.map((call) => ({
            id: call.id,
            name: call.function.name,
          })) ?? [];
        record.chosen_tools =
          result.choices?.[0]?.message?.tool_calls?.map(
            (call) => call.function.name,
          ) ?? [];
        console.log(
          `S16 live tools: ${record.chosen_tools.join(", ") || "answer"}`,
        );
        reply(result.choices[0].message);
        return;
      } catch (error) {
        record.upstream_error_name =
          error instanceof Error ? error.name : "UnknownError";
        record.upstream_elapsed_ms = Date.now() - started;
        console.log(`S16 live upstream error: ${record.upstream_error_name}`);
        res.writeHead(502);
        res.end("upstream unavailable");
        return;
      }
    }
    if (
      (body.messages?.[0]?.content ?? "").includes(
        "Classify the user's browser request",
      )
    ) {
      reply({ content: '{"route":"SOURCE_READ_REQUIRED"}' });
      return;
    }
    const schemas = new Set(record.tools);
    if (!schemas.has("list_page_resources")) {
      record.system = (body.messages?.[0]?.content ?? "").slice(0, 240);
      console.log("S16 unexpected request", record.system, record.tools);
      reply({ content: "S16 unexpected fixture request" });
      return;
    }
    for (const name of [
      "list_page_resources",
      "search_page_resources",
      "read_page_resource",
    ])
      assert.ok(schemas.has(name), `missing ${name}`);
    const returned = record.returned.map((message) => {
      const match = message.content.match(
        /\[UNTRUSTED_TOOL_RESULT\]\n([^]*?)\n\[\/UNTRUSTED_TOOL_RESULT\]/,
      );
      return match ? JSON.parse(match[1]) : null;
    });
    const turn = returned.length;
    const tool = (name, args) =>
      reply({
        tool_calls: [
          {
            id: `s16-call-${String(turn).padStart(16, "0")}`,
            type: "function",
            function: { name, arguments: JSON.stringify(args) },
          },
        ],
      });
    if (turn === 0) return tool("list_page_resources", { page_size: 2 });
    if (turn === 1) {
      if (!returned[0].next_cursor) {
        console.log("S16 first inventory result", returned[0]);
        reply({ content: "S16 inventory fixture failure" });
        return;
      }
      assert.ok(returned[0].next_cursor, "inventory pagination missing");
      return tool("list_page_resources", {
        page_size: 2,
        cursor: returned[0].next_cursor,
      });
    }
    if (turn === 2) {
      return tool("search_page_resources", {
        query: "unfamiliarReportTransform",
        page_size: 4,
      });
    }
    if (current.id === "deny") {
      assert.ok(
        returned.at(-1).unavailable.some((item) => item.status === "DENIED"),
      );
      reply({ content: "S16 source denied; no code read." });
      return;
    }
    if (current.id === "source-change") {
      assert.equal(returned.at(-1).status, "STALE");
      reply({ content: "S16 source changed; rediscovery required." });
      return;
    }
    if (turn === 3) {
      const hit = returned.at(-1).hits[0];
      assert.ok(hit, "search hit missing");
      current.resource = hit.resource_id;
      return tool("read_page_resource", {
        resource_id: hit.resource_id,
        resource_revision: hit.resource_revision,
        max_bytes: 120,
      });
    }
    if (turn === 4) {
      const chunk = returned.at(-1);
      assert.equal(chunk.status, "AVAILABLE");
      assert.ok(chunk.continuation);
      return tool("read_page_resource", {
        resource_id: current.resource,
        resource_revision: chunk.resource_revision,
        cursor: chunk.continuation.cursor,
        max_bytes: 120,
      });
    }
    assert.equal(returned.at(-1).status, "AVAILABLE");
    reply({
      content:
        "S16 grounded static source read complete; only partial source was read.\n```js\nfunction unfamiliarReportTransform(input) { return input.map(row => row.amount * 3); }\n```",
    });
  },
);
const port = await reservePort();
const child = spawn(
  executable,
  [
    "--headless=new",
    "--window-size=1440,1100",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--ignore-certificate-errors",
    "--host-resolver-rules=MAP s1.fixture.test 127.0.0.1",
    `--user-data-dir=${profile}`,
    `--load-extension=${resolve("dist-extension")}`,
    `--disable-extensions-except=${resolve("dist-extension")}`,
    `--remote-debugging-port=${port}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);
try {
  const version = await waitFor(
    () =>
      fetch(`http://127.0.0.1:${port}/json/version`)
        .then((response) => response.json())
        .catch(() => undefined),
    15000,
    "CHROME_READY",
  );
  const targets = () =>
    fetch(`http://127.0.0.1:${port}/json/list`).then((response) =>
      response.json(),
    );
  const worker = await waitFor(
    async () =>
      (await targets()).find(
        (target) =>
          target.type === "service_worker" &&
          target.url.endsWith("/js/service-worker.js"),
      ),
    15000,
    "WORKER_READY",
  );
  const extensionId = new URL(worker.url).host;
  const fixtureTarget = await cdp(
    version.webSocketDebuggerUrl,
    "Target.createTarget",
    { url: `https://s1.fixture.test:${fixture.fixturePort}/` },
  );
  const page = await waitFor(
    async () =>
      (await targets()).find((target) => target.id === fixtureTarget.targetId),
    10000,
    "PAGE_READY",
  );
  const { panel } = await openAnalysisPanel({
    cdpPort: port,
    extensionId,
    fixtureTarget,
    version,
    worker,
  });
  const send = (message) =>
    evaluate(panel, `chrome.runtime.sendMessage(${JSON.stringify(message)})`);
  assert.equal(
    (
      await send({
        kind: "PROVIDER_SAVE",
        payload: {
          id: "fixture",
          config: {
            plugin_id: "contextpilot.openai-compatible",
            plugin_version: "1.0.0",
            label: "S16 controlled fixture",
            base_url: `https://s1.fixture.test:${fixture.fixturePort}/v1`,
            wire_api: "chat_completions",
            model: "fixture",
            api_key: "",
            api_key_header: "none",
            headers: [],
            timeout_ms: liveModel ? 90000 : 15000,
            enabled: true,
          },
        },
      })
    ).ok,
    true,
  );
  await evaluate(
    panel,
    `(()=>{window.__downloads=[];const original=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{blob.arrayBuffer().then(buffer=>window.__downloads.push(Array.from(new Uint8Array(buffer))));return original(blob)};HTMLAnchorElement.prototype.click=function(){};return true})()`,
  );
  for (current of [
    { id: "allow" },
    { id: "deny" },
    { id: "stop" },
    { id: "source-change" },
    { id: "navigation" },
    { id: "worker-restart" },
  ].filter(
    (item) =>
      !process.env.S16_CASES ||
      process.env.S16_CASES.split(",").includes(item.id),
  )) {
    if (liveModel && current.id !== "allow") continue;
    try {
      await send({ kind: "CANCEL" });
      await send({ kind: "CHAT_CLEAR" });
      await cdp(page.webSocketDebuggerUrl, "Page.navigate", {
        url: `https://s1.fixture.test:${fixture.fixturePort}/?case=${current.id}`,
      });
      await sleep(700);
      await cdp(version.webSocketDebuggerUrl, "Target.activateTarget", {
        targetId: fixtureTarget.targetId,
      });
      const start = calls.length;
      await evaluate(
        panel,
        `(()=>{document.querySelector('#mode-act').click();document.querySelector('#chat-input').value=${JSON.stringify(prompt)};document.querySelector('#chat-form').requestSubmit();return true})()`,
      );
      let consentSeen = false;
      const deadline = Date.now() + (liveModel ? 180000 : 30000);
      while (Date.now() < deadline) {
        await sleep(150);
        await evaluate(
          panel,
          `(()=>{const button=[...document.querySelectorAll('.event-card button')].find(button=>!button.disabled&&button.textContent.includes('일반 한 단계 실행'));button?.click();return true})()`,
        );
        const consent = await evaluate(
          panel,
          `[...document.querySelectorAll('.event-card')].some(card=>card.textContent.includes('페이지 소스 전달 동의')&&[...card.querySelectorAll('button')].some(button=>!button.disabled))`,
        );
        if (consent) {
          const firstConsent = !consentSeen;
          consentSeen = true;
          if (firstConsent)
            assert.ok(
              !calls
                .slice(start)
                .some((call) =>
                  call.returned.some((message) =>
                    message.content.includes(
                      "function unfamiliarReportTransform",
                    ),
                  ),
                ),
              "source disclosed before consent",
            );
          if (current.id === "stop") {
            await send({ kind: "CANCEL" });
            break;
          }
          if (current.id === "navigation") {
            await cdp(page.webSocketDebuggerUrl, "Page.navigate", {
              url: `https://s1.fixture.test:${fixture.fixturePort}/?new-document=1`,
            });
            continue;
          }
          if (current.id === "worker-restart") {
            const activeWorker = (await targets()).find(
              (target) =>
                target.type === "service_worker" && target.url === worker.url,
            );
            await cdp(version.webSocketDebuggerUrl, "Target.closeTarget", {
              targetId: activeWorker.id,
            });
            await send({ kind: "CHAT_RECOVER" });
            continue;
          }
          if (current.id === "source-change")
            await evaluate(
              page,
              `document.scripts[0].textContent += '\\n// changed after consent request'`,
            );
          await evaluate(
            panel,
            `(()=>{const card=[...document.querySelectorAll('.event-card')].find(card=>card.textContent.includes('페이지 소스 전달 동의')&&[...card.querySelectorAll('button')].some(button=>!button.disabled));const button=[...card.querySelectorAll('button')].find(button=>button.textContent.includes(${JSON.stringify(current.id === "deny" ? "거부" : "이번 요청에 허용")}));button.click();return true})()`,
          );
        }
        const idle = await evaluate(
          panel,
          "document.querySelector('#chat-send')?.dataset.state==='send'",
        );
        if (idle && calls.length > start && consentSeen) break;
      }
      await sleep(400);
      assert.equal(consentSeen, true, "source consent UI not shown");
      assert.equal(
        await evaluate(
          panel,
          "document.querySelector('#chat-send')?.dataset.state",
        ),
        "send",
        "request did not settle",
      );
      const ownCalls = calls.slice(start);
      if (current.id === "allow" && liveModel) {
        const returned = ownCalls.at(-1).returned.map((message) => ({
          id: message.id,
          value: JSON.parse(
            message.content.split("\n").slice(1, -1).join("\n"),
          ),
        }));
        for (const name of [
          "list_page_resources",
          "search_page_resources",
          "read_page_resource",
        ]) {
          assert.ok(
            ownCalls.some((call) => call.chosen_tools?.includes(name)),
            `live model did not choose ${name}`,
          );
          assert.ok(
            returned.some(
              (item) =>
                ownCalls.some((call) =>
                  call.chosen_calls?.some(
                    (chosen) => chosen.id === item.id && chosen.name === name,
                  ),
                ) && item.value.status === "AVAILABLE",
            ),
            `no successful live result for ${name}`,
          );
        }
        assert.ok(ownCalls.at(-1).answer, "live final answer missing");
        assert.ok(
          returned.some((item) => {
            const text = item.value.content?.text;
            return (
              typeof text === "string" &&
              text.includes("unfamiliarReportTransform") &&
              /amount\s*\*\s*3/.test(text)
            );
          }),
          "live source read did not contain the requested calculation",
        );
        assert.match(
          ownCalls.at(-1).answer,
          /(?:amount\s*\*\s*3|multipl(?:y|ies|ied)[\s\S]{0,80}(?:3|three)|(?:3|three)\s*(?:times|배)|3(?:을|를)?\s*곱|tripl(?:e|es|ed))/i,
          "live final answer did not explain the calculation",
        );
      }
      if (current.id === "allow" && !liveModel) {
        assert.equal(ownCalls.at(-1).returned.length, 5);
        assert.ok(
          ownCalls.at(-1).returned.at(-1).content.includes('"byte_offset":120'),
        );
        assert.equal(
          new Set(ownCalls.at(-1).returned.map((message) => message.id)).size,
          5,
        );
      }
      if (["stop", "navigation", "worker-restart"].includes(current.id))
        assert.ok(
          !ownCalls.some((call) => call.returned.length > 2),
          "late source result after Stop",
        );
      if (current.id === "source-change")
        assert.ok(
          ownCalls.some((call) =>
            call.returned.some((message) =>
              message.content.includes("SOURCE_CHANGED"),
            ),
          ),
          "source drift not reported",
        );
      assert.equal(
        await evaluate(page, "document.querySelector('#note').value"),
        "",
      );
      const baseline = await evaluate(panel, "window.__downloads.length");
      await evaluate(
        panel,
        "document.querySelector('#diagnostics-export').click()",
      );
      const bytes = await waitFor(
        () =>
          evaluate(
            panel,
            `window.__downloads.length>${baseline}?window.__downloads.at(-1):null`,
          ),
        10000,
        "DIAGNOSTICS_ZIP",
      );
      const zip = checkDiagnosticsZip(bytes);
      const text = JSON.stringify(zip);
      if (text.includes("function unfamiliarReportTransform")) {
        const paths = [];
        const locate = (value, path, method) => {
          if (
            typeof value === "string" &&
            value.includes("function unfamiliarReportTransform")
          ) {
            if (paths.length < 12) paths.push({ path, method });
            return;
          }
          if (value && typeof value === "object")
            for (const [key, child] of Object.entries(value))
              locate(child, `${path}.${key}`, value.method ?? method);
        };
        locate(zip, "$", undefined);
        console.log("Source diagnostic locations", paths);
      }
      assert.equal(
        text.includes(secret),
        false,
        "raw secret in diagnostics ZIP",
      );
      assert.equal(
        text.includes("function unfamiliarReportTransform"),
        false,
        "raw script source in diagnostics ZIP",
      );
      results.push({
        id: current.id,
        pass: true,
        provider: liveModel ?? "controlled",
        calls: ownCalls,
        diagnostics_masked: true,
      });
      console.log(`S16 ${current.id}: PASS`);
    } catch (error) {
      results.push({
        id: current.id,
        pass: false,
        error: String(error),
        calls: calls.filter((call) => call.case === current.id),
      });
      console.log(`S16 ${current.id}: FAIL ${error}`);
    }
    if (process.env.S16_REPORT)
      await writeFile(process.env.S16_REPORT, JSON.stringify(results, null, 2));
  }
  assert.ok(
    results.every((result) => result.pass),
    JSON.stringify(
      results
        .filter((result) => !result.pass)
        .map(({ id, error }) => ({ id, error })),
    ),
  );
} finally {
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("close", resolve));
  await new Promise((resolve) => fixture.fixture.close(resolve));
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
  await rm(cert, { recursive: true, force: true, maxRetries: 3 });
}
