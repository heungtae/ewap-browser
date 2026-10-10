import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { parseTool } from "./chrome-s19-fixture.mjs";
import { s20Private } from "./chrome-s20-fixture.mjs";
import { s20Controlled } from "./chrome-s20-controlled.mjs";
const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const s20Provider =
  ({ calls, current, live, model, controlled = s20Controlled }) =>
  async (_req, res, body) => {
    const c = current();
    const record = {
      case: c.id,
      tools:
        body.tools?.map((t) => ({
          name: t.function.name,
          schema_hash: hash(t.function.parameters),
        })) ?? [],
      returned: [],
      response: [],
    };
    calls.push(record);
    try {
      assert.equal(
        JSON.stringify(body).includes(s20Private),
        false,
        "sensitive data reached Provider",
      );
      const returned = body.messages
        .filter((m) => m.role === "tool")
        .map((m) => ({ id: m.tool_call_id, value: parseTool(m.content) }));
      record.returned = returned.map(({ id, value }) => ({
        id,
        status: value.status,
        code: value.code,
        coverage: value.coverage,
        source_read:
          typeof value.content?.text === "string" ||
          typeof value.source_text === "string",
        workflow_read: typeof value.source_text === "string",
        source_hash: hash(value),
        source_rule_observed:
          typeof value.content?.text === "string" &&
          value.content.text.includes(c.functionName),
        component_read: !!value.content?.rows,
        changed_data: JSON.stringify(value.content?.rows ?? []).includes(
          `Ready ${c.target}`,
        ),
        execution:
          value.verification_meaning === "ACTION_RESULT_NOT_GOAL_COMPLETION",
        outcome: value.outcome,
        verifier: value.verifier,
        dispatched: value.dispatched,
      }));
      const inventory = body.messages.findLast(
        (m) =>
          typeof m.content === "string" &&
          m.content.startsWith("[UNTRUSTED_EXECUTION_INVENTORY]"),
      );
      if (inventory) {
        const value = JSON.parse(inventory.content.split("\n")[1]);
        record.observation_id = value.observation_id;
        record.contracts = value.read_contracts?.map((r) => ({
          name: r.name,
          supported: r.supported,
          consent: r.consent,
          version: r.version,
          binding: r.binding,
          budget: r.budget,
          input_schema_hash: hash(r.inputSchema),
          result_schema_hash: hash(r.resultSchema),
        }));
      }
      record.request_hash = hash(body);
      let message;
      if (model) {
        const started = Date.now();
        const response = await fetch(live.endpoint, {
          method: "POST",
          headers: live.headers,
          body: JSON.stringify({
            ...body,
            model,
            ...live.parameters,
            stream: false,
          }),
          signal: AbortSignal.timeout(60000),
        });
        record.upstream_status = response.status;
        record.upstream_ms = Date.now() - started;
        console.log(`S20 ${c.id} HTTP ${response.status}`);
        if (!response.ok) throw Error(`UPSTREAM_HTTP_${response.status}`);
        message = (await response.json()).choices?.[0]?.message;
      } else message = controlled(body, c, returned);
      if (body.messages[0]?.content?.includes("Classify the user"))
        record.intent_route = JSON.parse(message.content).route;
      record.plans = (message?.tool_calls ?? [])
        .filter((t) => t.function.name === "submit_plan")
        .map((t) => {
          const args = JSON.parse(t.function.arguments);
          const inventory = JSON.parse(
            body.messages
              .findLast((m) =>
                m.content?.startsWith("[UNTRUSTED_EXECUTION_INVENTORY]"),
              )
              .content.split("\n")[1],
          );
          return {
            id: t.id,
            steps: args.steps.map((s) => ({
              capability: s.capability,
              input_present: s.user_input !== undefined,
              api_input_is_option_id: inventory.page_api_actions?.some((a) =>
                a.option_ids.includes(s.user_input),
              ),
              api_input_is_label: inventory.page_api_actions?.some((a) =>
                Object.values(a.option_labels).includes(s.user_input),
              ),
            })),
          };
        });
      record.proposals = (message?.tool_calls ?? [])
        .filter((t) => t.function.name === "propose_page_api")
        .map((t) => {
          const args = JSON.parse(t.function.arguments);
          const schema = body.tools.find(
            (tool) => tool.function.name === t.function.name,
          ).function.parameters;
          return {
            id: t.id,
            keys: Object.keys(args),
            option_id: args.option_id,
            approval_scope: args.approval_scope,
            current_action_ref: schema.properties.action_ref.enum.includes(
              args.action_ref,
            ),
          };
        });
      record.answer_hash =
        typeof message?.content === "string"
          ? hash(message.content)
          : undefined;
      record.response =
        message?.tool_calls?.map((t) => ({
          id: t.id,
          name: t.function.name,
          ...(t.function.name === "report_goal_status"
            ? {
                goal: JSON.parse(t.function.arguments).status,
                observation_id: JSON.parse(t.function.arguments).observation_id,
              }
            : {}),
        })) ?? [];
      console.log(
        `S20 ${c.id} tools ${record.response.map((t) => t.name).join(",") || "answer"}`,
      );
      res.writeHead(200, {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
      });
      res.end(JSON.stringify({ choices: [{ message }] }));
    } catch (error) {
      record.error = error.name;
      console.log(`S20 fixture/upstream ${error.name}`);
      res.writeHead(502);
      res.end("fixture/upstream failed");
    }
  };
