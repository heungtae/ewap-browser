import { s20Provider } from "./chrome-s20-provider.mjs";
export const s21Provider = (options) =>
  s20Provider({
    ...options,
    controlled(body, c) {
      if (body.messages[0]?.content?.includes("Classify the user"))
        return { content: JSON.stringify({ route: "ACTION_REQUIRED" }) };
      const tool = (name) => body.tools?.find((t) => t.function.name === name);
      const call = (name, args) => ({
        content: "",
        tool_calls: [
          {
            id: `s21-${c.id}-${++c.n}-abcdefghijklmnop`,
            type: "function",
            function: { name, arguments: JSON.stringify(args) },
          },
        ],
      });
      if (tool("assess_action_result")) {
        const packet = JSON.parse(
          body.messages
            .findLast((m) =>
              m.content.startsWith("[UNTRUSTED_ACTION_EVIDENCE]"),
            )
            .content.split("\n")[1],
        );
        const changed = packet.evidence.filter((e) => e.changed);
        if (!changed.length && !c.read) {
          c.read = true;
          return call("read_control_observation", {});
        }
        return call("assess_action_result", {
          phase: "action",
          observation_id: packet.observation_id,
          attempt_id: packet.attempt_id,
          decision:
            changed.length && c.id !== "not-completed"
              ? "confirmed"
              : "unknown",
          facts: "The observed checked state changed to the requested state.",
          rationale:
            "The current related control state satisfies this local UI selection.",
          evidence_ids: changed.map((e) => e.id),
        });
      }
      if (tool("report_goal_status")) {
        const schema = tool("report_goal_status").function.parameters;
        const inventory = JSON.parse(
          body.messages
            .findLast((m) =>
              m.content.startsWith("[UNTRUSTED_EXECUTION_INVENTORY]"),
            )
            .content.split("\n")[1],
        );
        const complete = inventory.execution_evidence.every(
          (e) => e.outcome === "VERIFIED",
        );
        return call("report_goal_status", {
          status: complete ? "completed" : "unknown",
          summary: complete
            ? "The requested option is selected."
            : "The result remains unconfirmed.",
          observation_id: schema.properties.observation_id.enum[0],
          ...(schema.properties.evidence_refs
            ? {
                evidence_refs: schema.properties.evidence_refs.items.enum.slice(
                  0,
                  1,
                ),
              }
            : {}),
        });
      }
      if (tool("assess_element")) {
        const schema = tool("assess_element").function.parameters;
        const checked = schema.properties.action.anyOf.find(
          (a) => a.properties.name.enum[0] === "propose_set_checked",
        );
        return call("assess_element", {
          phase: "element",
          observation_id: schema.properties.observation_id.enum[0],
          decision: "propose_action",
          rationale:
            "Use the supported ARIA radio action instead of typing in the read-only control.",
          expected_observation: "The radio becomes checked.",
          evidence_ids: schema.properties.evidence_ids.items.enum,
          action: {
            name: "propose_set_checked",
            arguments: {
              target: checked.properties.arguments.properties.target.enum[0],
              checked: true,
              approval_scope: "single_step",
              approval_reason: "Select radio",
            },
          },
        });
      }
      if (c.id === "element" && !c.rejected) {
        c.rejected = true;
        const projection = JSON.parse(
          body.messages
            .findLast((m) =>
              m.content.startsWith("[UNTRUSTED_PAGE_PROJECTION]"),
            )
            .content.split("\n")[1],
        );
        const unsupported = projection.nodes.find(
          (node) => node.name === "Read only",
        );
        return call("propose_set_text", {
          target: unsupported.model_ref,
          value: "500",
          value_source_revision: 1,
          approval_scope: "single_step",
          approval_reason: "Unsupported candidate test",
        });
      }
      if (c.id.startsWith("generic-") && tool("propose_click"))
        return call("propose_click", {
          target:
            tool("propose_click").function.parameters.properties.target.enum[0],
          approval_scope: "single_step",
          approval_reason: "Perform the requested local click",
        });
      const checked = tool("propose_set_checked");
      if (checked)
        return call("propose_set_checked", {
          target: checked.function.parameters.properties.target.enum[0],
          checked: true,
          approval_scope: "single_step",
          approval_reason: "Select the requested option",
        });
      return { content: "The control is unsupported or blocked." };
    },
  });
