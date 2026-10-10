import assert from "node:assert/strict";
import { s19Reply, parseTool, s19Private } from "./chrome-s19-fixture.mjs";
export const s19Provider =
  ({ calls, current, liveModel, live }) =>
  async (_req, res, body) => {
    try {
      assert.equal(
        JSON.stringify(body).includes(s19Private),
        false,
        "sensitive component data reached Provider",
      );
      const returned = body.messages
        .filter((m) => m.role === "tool")
        .map((m) => ({ id: m.tool_call_id, value: parseTool(m.content) }));
      const record = {
        case: current().id,
        tools: body.tools?.map((t) => t.function.name) ?? [],
        returned: returned.map(({ id, value }) => ({
          id,
          status: value.status,
          channel: value.content?.channel,
          coverage: value.coverage,
          restored: value.restored_position,
          descriptor: value.descriptor,
          code: value.code,
          execution:
            value.verification_meaning === "ACTION_RESULT_NOT_GOAL_COMPLETION",
          ...(current().action
            ? {
                outcome: value.outcome,
                observed: value.observed,
                dispatched: value.dispatched,
                verifier: value.verifier,
                action_data_observed:
                  !!value.content?.rows &&
                  JSON.stringify(value.content.rows).includes(
                    current().kind === "tree"
                      ? "Hidden descendant"
                      : "Following page",
                  ),
              }
            : {}),
        })),
        images: body.messages.filter((m) => Array.isArray(m.content)).length,
      };
      calls.push(record);
      let message;
      if (liveModel) {
        try {
          const response = await fetch(live.endpoint, {
            method: "POST",
            headers: live.headers,
            body: JSON.stringify({
              ...body,
              model: liveModel,
              ...live.parameters,
              stream: false,
            }),
            signal: AbortSignal.timeout(60000),
          });
          record.upstream_status = response.status;
          console.log(`S19 live ${current().id}: HTTP ${response.status}`);
          if (!response.ok) {
            res.writeHead(502);
            res.end("upstream unavailable");
            return;
          }
          message = (await response.json()).choices?.[0]?.message;
        } catch (error) {
          record.upstream_error_name = error.name;
          res.writeHead(502);
          res.end("upstream unavailable");
          console.log(`S19 upstream ${current().id}: ${error.name}`);
          return;
        }
      } else message = s19Reply(body, current());
      record.responseTools =
        message?.tool_calls?.map((call) => call.function.name) ?? [];
      if (liveModel)
        console.log(
          `S19 live ${current().id} tools: ${record.responseTools.join(",") || "answer"}`,
        );
      record.goalStatus = message?.tool_calls
        ?.filter((call) => call.function.name === "report_goal_status")
        .map((call) => JSON.parse(call.function.arguments).status);
      record.responseCallIds =
        message?.tool_calls?.map((call) => call.id) ?? [];
      if (current().action) {
        res.writeHead(200, {
          "content-type": "application/json",
          "access-control-allow-origin": "*",
        });
        res.end(JSON.stringify({ choices: [{ message }] }));
        return;
      }
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "access-control-allow-origin": "*",
      });
      res.end(
        `data: ${JSON.stringify({ choices: [{ delta: message }] })}\n\ndata: [DONE]\n\n`,
      );
    } catch (error) {
      console.log("S19 fixture error", error.name);
      res.writeHead(500);
      res.end("fixture error");
    }
  };
