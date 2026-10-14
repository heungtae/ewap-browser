import { s24LiveMessage } from "./chrome-s24-live-provider.mjs";
import { verifyS24Chrome } from "./chrome-s24-checks.mjs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createS1Fixture } from "./chrome-s1-fixture.mjs";
import { openS19Chrome } from "./chrome-s19-harness.mjs";
import { evaluate, waitFor } from "./chrome-cdp-utils.mjs";
const cert = await mkdtemp(join(tmpdir(), "contextpilot-s24-cert-"));
const evidence = [];
let harness;
const fixture = await createS1Fixture(
  cert,
  "<!doctype html><main><h1>Page help</h1><p>This page displays a table and search controls.</p><button>Inspect</button></main>",
  async (_req, res, body) => {
    const tools = body.tools?.map((t) => t.function.name) ?? [];
    const returned = body.messages.filter((m) => m.role === "tool");
    evidence.push({
      tools,
      tool_call_ids: returned.map((m) => m.tool_call_id),
      statuses: returned.map((m) => {
        try {
          const value = JSON.parse(m.content.split("\n")[1]);
          return {
            tool_call_id: m.tool_call_id,
            status: value.status,
            code: value.code,
            dry_run: value.dry_run === true,
          };
        } catch {
          return {};
        }
      }),
    });
    const isSecond = body.messages.some((m) =>
      m.content?.includes("second-page-help"),
    );
    const start = body.messages.findLastIndex(
      (m) =>
        m.role === "user" &&
        m.content?.includes(isSecond ? "second-page-help" : "first-page-help"),
    );
    const lastAssistant = body.messages
      .slice(start + 1)
      .findLast((m) => m.role === "assistant");
    const already = lastAssistant?.tool_calls?.some((c) =>
      ["describe_learned_task", "page_cmd_0"].includes(c.function.name),
    );
    const name =
      isSecond && tools.includes("page_cmd_0")
        ? "page_cmd_0"
        : "describe_learned_task";
    let message =
      already || !tools.includes("describe_learned_task")
        ? { role: "assistant", content: "This page displays public page help." }
        : {
            role: "assistant",
            content: "",
            tool_calls: [
              {
                id: `call-s24-${String(evidence.length).padStart(12, "0")}`,
                type: "function",
                function: {
                  name,
                  arguments:
                    name === "page_cmd_0"
                      ? "{}"
                      : JSON.stringify({
                          kind: "help",
                          target: "page",
                          coverage: "visible",
                          input: "none",
                        }),
                },
              },
            ],
          };
    if (process.env.S24_LIVE_MODEL) {
      try {
        message = await s24LiveMessage(body, evidence);
      } catch (error) {
        res.writeHead(502, {
          "content-type": "application/json",
          "access-control-allow-origin": "*",
        });
        res.end(JSON.stringify({ error: { message: error.message } }));
        return;
      }
    }
    evidence.at(-1).returned_tools =
      message.tool_calls?.map((c) => c.function.name) ?? [];
    evidence.at(-1).returned_ids = message.tool_calls?.map((c) => c.id) ?? [];
    res.writeHead(200, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    });
    res.end(
      JSON.stringify({
        id: "s24-fixture",
        choices: [
          {
            message,
            finish_reason: message.tool_calls ? "tool_calls" : "stop",
          },
        ],
      }),
    );
  },
);
try {
  harness = await openS19Chrome({
    executable: process.env.CHROME_FOR_TESTING_BIN,
    fixture,
    liveModel: process.env.S24_LIVE_MODEL,
    pageUrl: `https://s1.fixture.test:${fixture.fixturePort}/?private-account=alice#tenant`,
  });
  const run = async (prompt) => {
    const turnsBefore = evidence.length;
    await evaluate(
      harness.panel,
      `(()=>{document.querySelector('#mode-ask').click();document.querySelector('#chat-input').value=${JSON.stringify(prompt)};document.querySelector('#chat-form').requestSubmit();return true})()`,
    );
    await waitFor(
      async () => {
        const busy = await evaluate(
          harness.panel,
          "document.querySelector('#chat-send').getAttribute('data-state')",
        );
        const text = await evaluate(harness.panel, "document.body.innerText");
        return (
          (process.env.S24_LIVE_MODEL
            ? evidence.length > turnsBefore
            : text?.includes("This page displays public page help.")) &&
          busy === "send"
        );
      },
      process.env.S24_LIVE_MODEL ? 95000 : 20000,
      "ASK_COMPLETION",
    );
  };
  await run("first-page-help: Explain this page.");
  await verifyS24Chrome(harness, run, evidence);
  console.log("S24 Chrome fixture passed.");
} catch (error) {
  await writeFile(
    process.env.S24_REPORT ?? "/tmp/s24-failed.json",
    JSON.stringify(
      {
        result: "FAIL",
        reason: error.message,
        provider_turns: evidence,
      },
      null,
      2,
    ),
  );
  console.error(error.message);
  throw error;
} finally {
  await harness?.close();
  await new Promise((resolve) => fixture.fixture.close(resolve));
  await rm(cert, { recursive: true, force: true });
}
