import assert from "node:assert/strict";
import { createServer } from "node:https";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
export const createS25DecisionFixture = async (cert) => {
  const calls = [];
  const mode = { fail: false };
  const server = createServer(
    {
      key: await readFile(join(cert, "key.pem")),
      cert: await readFile(join(cert, "cert.pem")),
    },
    async (req, res) => {
      const headers = {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "content-type, authorization",
        "access-control-allow-methods": "POST, GET, OPTIONS",
      };
      if (req.method === "OPTIONS") {
        res.writeHead(204, headers);
        res.end();
        return;
      }
      if (req.method === "GET" && req.url === "/v1/models") {
        res.writeHead(200, headers);
        res.end(JSON.stringify({ models: [{ name: "jev-1.13.0" }] }));
        return;
      }
      assert.equal(req.url, "/v1/systemone");
      assert.equal(req.headers.cookie, undefined);
      assert.equal(req.headers.authorization, "Bearer s25-fixture-key");
      let raw = "";
      for await (const chunk of req) raw += chunk;
      assert.ok(!raw.includes("S25_SECRET_PASSWORD"));
      const body = JSON.parse(raw);
      const phase = body.state.original_request
        ? (body.state.phase ??
          (body.questions.answer_kind
            ? "candidate_selection"
            : body.questions.verdict?.criteria.ACTION_REQUIRED
              ? "intent"
              : body.questions.verdict?.criteria.completed
                ? "goal_assessment"
                : "result_acceptance"))
        : "connection";
      calls.push({
        phase,
        question_count: Object.keys(body.questions).length,
        failed: mode.fail,
        status: mode.fail ? 503 : 200,
      });
      if (mode.fail) {
        res.writeHead(503, headers);
        res.end(
          JSON.stringify({
            error: "private rejected input S25_SECRET_PASSWORD",
          }),
        );
        return;
      }
      const finite = body.state.original_request?.includes("finite-yes");
      const choices = {
        processor:
          phase === "candidate_selection" && !finite
            ? "PRIMARY_LLM"
            : "JEV_DECISION",
        answer_kind: finite ? "finite" : "generation",
        verdict:
          phase === "intent"
            ? body.questions.verdict.criteria.ACTION_REQUIRED
              ? "ACTION_REQUIRED"
              : finite
                ? "finite"
                : "generation"
            : phase === "candidate_selection"
              ? "yes"
              : phase === "goal_assessment"
                ? "completed"
                : "accept",
        color: "blue",
      };
      const answers = Object.fromEntries(
        Object.entries(body.questions).map(([id, q]) => {
          if (q.type === "noul") return [id, { type: "noul", noul: 0.99 }];
          const keys = Object.keys(q.criteria),
            choice = choices[id] ?? keys[0];
          assert.ok(keys.includes(choice));
          return [
            id,
            {
              type: "choice",
              choice,
              confidence: 1,
              probabilities: Object.fromEntries(
                keys.map((k) => [k, k === choice ? 1 : 0]),
              ),
            },
          ];
        }),
      );
      res.writeHead(200, headers);
      res.end(
        JSON.stringify({
          model: body.model,
          answers,
          usage: { input_tokens: 100, output_tokens: 10 },
        }),
      );
    },
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    calls,
    mode,
    port: server.address().port,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};
export const s25PrimaryFixture = (calls) => async (_req, res, body) => {
  const tools = body.tools ?? [],
    get = (name) => tools.find((t) => t.function.name === name);
  const returned = body.messages
    .filter((m) => m.role === "tool")
    .map((m) => m.tool_call_id);
  calls.push({
    tools: tools.map((t) => t.function.name),
    returned_ids: returned,
  });
  const call = (name, args) => ({
    content: "",
    tool_calls: [
      {
        id: `s25-primary-${calls.length}-abcdefghijklmnop`,
        type: "function",
        function: { name, arguments: JSON.stringify(args) },
      },
    ],
  });
  let message;
  if (body.messages[0]?.content?.includes("Classify the user"))
    message = { content: '{"route":"ACTION_REQUIRED"}' };
  else if (get("report_goal_status")) {
    const p = get("report_goal_status").function.parameters.properties;
    message = call("report_goal_status", {
      status: "completed",
      summary: "Saved is visible.",
      observation_id: p.observation_id.enum[0],
    });
  } else if (get("propose_click")) {
    const p = get("propose_click").function.parameters.properties;
    message = call("propose_click", {
      target: p.target.enum[0],
      approval_scope: "single_step",
      approval_reason: "Perform the requested local Save once.",
    });
  } else if (get("submit_answer_review"))
    message = call("submit_answer_review", { verdict: "accept" });
  else {
    const start = body.messages.findLastIndex((m) =>
      m.content?.includes("User question:"),
    );
    const read = body.messages
      .slice(start + 1)
      .some(
        (m) => m.role === "tool" && m.tool_call_id?.startsWith("s25-primary-"),
      );
    message =
      !read && get("get_page_text")
        ? call("get_page_text", {})
        : {
            content:
              "S25 prepared answer: the visible page contains a Save button.",
          };
  }
  calls.at(-1).returned_tools =
    message.tool_calls?.map((c) => c.function.name) ?? [];
  calls.at(-1).call_ids = message.tool_calls?.map((c) => c.id) ?? [];
  res.writeHead(200, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
  });
  res.end(
    JSON.stringify({
      choices: [
        {
          message: { role: "assistant", ...message },
          finish_reason: message.tool_calls ? "tool_calls" : "stop",
        },
      ],
    }),
  );
};
