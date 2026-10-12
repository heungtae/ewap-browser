import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createS1Fixture } from "./chrome-s1-fixture.mjs";
import { evaluate } from "./chrome-cdp-utils.mjs";
import { parseTool } from "./chrome-s19-fixture.mjs";
import { createS23Provider } from "./chrome-s23-provider.mjs";
export const createS23Fixture = async (config, calls, getHarness) => {
  const {
    model,
    live,
    methodScript,
    pageHtml,
    fixtureSecret,
    caseName,
    rootName,
    methodName,
  } = config;
  const state = { n: 0 };
  const controlled = createS23Provider(config);
  const hash = (value) =>
    createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const cert = await mkdtemp(join(tmpdir(), "contextpilot-s23-cert-"));
  const fixture = await createS1Fixture(
    cert,
    async (url) =>
      new URL(url, "https://s1.fixture.test").pathname === "/"
        ? pageHtml
        : new URL(url, "https://s1.fixture.test").pathname ===
            "/report-tools.js"
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
                (() => {
                  try {
                    return JSON.parse(result.return_data.value).sum === 7;
                  } catch {
                    return false;
                  }
                })(),
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
        let upstream;
        try {
          upstream = await fetch(live.endpoint, {
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
        } catch {
          record.upstream_failure = "UPSTREAM_UNAVAILABLE";
          response.writeHead(502, {
            "content-type": "application/json",
            "access-control-allow-origin": "*",
          });
          response.end(
            JSON.stringify({ error: { code: "UPSTREAM_UNAVAILABLE" } }),
          );
          return;
        }
        record.upstream_status = upstream.status;
        if (!upstream.ok) {
          response.writeHead(upstream.status, {
            "content-type": "application/json",
            "access-control-allow-origin": "*",
          });
          response.end(
            JSON.stringify({
              error: { code: `UPSTREAM_HTTP_${upstream.status}` },
            }),
          );
          return;
        }
        message = (await upstream.json()).choices?.[0]?.message;
      } else {
        message = controlled(body, state);
      }
      if (record.offered_tools.length === 0) {
        let route;
        try {
          route = JSON.parse(message?.content ?? "{}").route;
        } catch {
          /* Classifier contract validation belongs to the extension. */
        }
        if (
          [
            "QUESTION",
            "SOURCE_READ_REQUIRED",
            "COMPONENT_READ_REQUIRED",
            "ANALYSIS_READ_REQUIRED",
            "ACTION_REQUIRED",
          ].includes(route)
        )
          record.classification = route;
      }
      console.log(
        `S23 provider turn ${record.request_index}: ${(message?.tool_calls ?? []).map((item) => item.function.name).join(",") || "answer"}`,
      );
      record.proposed = (message?.tool_calls ?? []).map((item) => ({
        id: item.id,
        name: item.function.name,
        ...(item.function.name === "report_goal_status"
          ? { goal_status: parseTool(item.function.arguments).status }
          : {}),
      }));
      if (
        caseName === "replacement" &&
        record.proposed.some((item) => item.name === "propose_page_method_call")
      )
        await evaluate(
          getHarness().page,
          `window[${JSON.stringify(rootName)}]={ [${JSON.stringify(methodName)}]:window[${JSON.stringify(rootName)}][${JSON.stringify(methodName)}] }`,
        );
      response.writeHead(200, {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
      });
      response.end(JSON.stringify({ choices: [{ message }] }));
    },
  );

  return { fixture, cert };
};
