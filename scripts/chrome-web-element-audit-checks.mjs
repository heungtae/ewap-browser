import { checkedControlRegression } from "./chrome-checked-control-regression.mjs";
import assert from "node:assert/strict";
import { evaluate } from "./chrome-cdp-utils.mjs";
import { pageDerivedActionTools } from "../dist/service-worker/page-derived-actions.js";
import { genericActTools } from "../dist/service-worker/act-tools.js";

export const runElementAuditChecks = async ({
  snapshot,
  send,
  page,
  tabId,
}) => {
  const checks = [];
  const node = (name) => snapshot.nodes.find((n) => n.name === name);
  const model = {
    ...snapshot,
    nodes: snapshot.nodes.map(({ ref_id, ...rest }) => ({
      ...rest,
      model_ref: ref_id,
    })),
  };
  const schemas = genericActTools(
    pageDerivedActionTools(snapshot),
    model,
    snapshot,
  );
  const offered = (name, tool) =>
    schemas
      .find((t) => t.function.name === tool)
      ?.function.parameters.properties.target.enum.includes(
        node(name)?.ref_id,
      ) ?? false;
  const record = (id, actual, expected) => {
    assert.deepEqual(actual, expected, id);
    checks.push({ id, observed: actual, result: "PASS" });
  };
  const intent = (name, tool, argument) => ({
    tool,
    ref_id: node(name).ref_id,
    document_epoch: snapshot.document_epoch,
    frame_id: 0,
    tab_id: tabId,
    run_id: "element-audit",
    profile: { id: "audit", version: 1 },
    argument,
  });
  for (const name of ["Custom radio", "Custom checkbox"]) {
    record(`${name}-offered`, offered(name, "propose_set_checked"), true);
    record(`${name}-checked-readable`, node(name).state.checked, false);
    record(
      `${name}-verified`,
      await send({
        kind: "CONTENT_EXECUTE_R1",
        intent: intent(name, "set_checked_by_ref", { checked: true }),
      }),
      { ok: true, postcondition: "semantic", dispatch: "dispatched" },
    );
  }
  record(
    "custom-controls-clicked-once",
    await evaluate(page, "[radioClicks,checkboxClicks]"),
    [1, 1],
  );
  record(
    "native-checkbox-selected",
    await send({
      kind: "CONTENT_EXECUTE_R1",
      intent: intent("Native checkbox", "set_checked_by_ref", {
        checked: true,
      }),
    }),
    { ok: true, postcondition: "semantic", dispatch: "dispatched" },
  );
  record(
    "native-checkbox-already-selected-no-op",
    await send({
      kind: "CONTENT_EXECUTE_R1",
      intent: intent("Native checkbox", "set_checked_by_ref", {
        checked: true,
      }),
    }),
    {
      ok: true,
      postcondition: "semantic",
      dispatch: "not_dispatched",
      already_satisfied: true,
    },
  );
  for (const name of ["ARIA disabled", "Fieldset disabled", "Read only"])
    record(
      `${name}-offered`,
      offered(
        name,
        name === "ARIA disabled" ? "propose_set_checked" : "propose_set_text",
      ),
      false,
    );
  record(
    "rich-editor-offered",
    offered("Rich editor", "propose_set_text"),
    false,
  );
  record(
    "rich-editor-value-verification-rejected",
    await send({
      kind: "CONTENT_VERIFY_BOUNDED_POSTCONDITION",
      intent: intent("Rich editor", "set_text_by_ref"),
      value_delivery: { value_kind: "text", value: "Old" },
    }),
    { ok: false, code: "INVALID_ARGUMENT" },
  );
  for (const name of [
    "Native range",
    "Native date",
    "Native file",
    "Input button",
    "Native number",
  ])
    record(
      `${name}-treated-as-textbox`,
      [node(name).role, offered(name, "propose_set_text")],
      [name === "Input button" ? "button" : "textbox", false],
    );
  record("toggle-pressed-readable", node("Toggle button").state.pressed, false);
  record("mixed-state-not-coerced", node("Mixed checkbox").state, {});
  record(
    "multi-select-treated-as-single",
    [
      node("Multi select").role,
      offered("Multi select", "propose_select_option"),
    ],
    ["combobox", false],
  );
  record(
    "list-option-click-offered",
    offered("List option", "propose_click"),
    true,
  );
  record(
    "missing-action-targets",
    [
      "Custom switch",
      "Custom slider",
      "Shadow button",
      "Frame button",
      "Unlabelled editor",
    ].filter((name) => !node(name)).length,
    5,
  );
  record("disclosure-state-readable", node("Disclosure").state, {
    expanded: false,
  });
  record(
    "link-navigation-offered",
    offered("Next link", "propose_navigate"),
    true,
  );
  await checkedControlRegression({ send, intent, record, page });
  return checks;
};
