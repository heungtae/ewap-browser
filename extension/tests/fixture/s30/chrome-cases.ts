import { setup } from "./setup.js";
import { digest } from "../../../../packages/codebase-schema/src/index.js";
import { openDatabase } from "../../../../packages/codebase-repository/src/index.js";
import {
  bindControl,
  LiveBindings,
  IndexedDbDispatchJournal,
} from "../../../../packages/browser-runtime/src/index.js";
import {
  ArgumentSources,
  ToolRuntime,
} from "../../../../packages/tool-runtime/src/index.js";
import { ToolContinuation } from "../../../../apps/chrome-extension/src/runtime/continuation.js";
import { approvalCard } from "../../../../apps/chrome-extension/src/runtime/approval-card.js";
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
export async function runCases() {
  const outcomes: string[] = [];
  let approvals = 0,
    dispatches = 0;
  async function run(kind: "fill" | "select" | "checked", satisfied = false) {
    const tool =
      kind === "fill"
        ? "web.fill"
        : kind === "select"
          ? "web.select"
          : "web.click";
    const f = await setup(tool);
    f.effect.business = "unknown";
    const control = document.createElement(
      kind === "select" ? "select" : "input",
    );
    control.id = `control-${kind}-${satisfied}`;
    if (control instanceof HTMLInputElement)
      control.type = kind === "checked" ? "checkbox" : "text";
    if (control instanceof HTMLSelectElement)
      for (const value of ["before", "after"]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        control.append(option);
      }
    const value = kind === "checked" ? true : "after";
    if (kind === "checked") (control as HTMLInputElement).checked = satisfied;
    else control.value = satisfied ? "after" : "before";
    document.body.append(control);
    const sources = new ArgumentSources(f.ui, () => f.context);
    const argument = sources.admit(f.principal, value);
    const bindings = new LiveBindings(() => f.context);
    bindings.install(
      await bindControl({
        element: control,
        tool,
        target: f.target,
        context: f.context,
        effect: f.effect,
        unique: () => document.querySelectorAll(`#${control.id}`).length === 1,
      }),
    );
    const db = await openDatabase(indexedDB, await digest(crypto.randomUUID()));
    const runtime = new ToolRuntime({
      registry: f.registry,
      capabilities: f.capabilities,
      arguments: sources,
      browser: bindings,
      journal: new IndexedDbDispatchJournal(db, f.context.partitionId),
      intent: { async record() {} },
      approvals: f.approvals,
      context: () => f.context,
      policy: () => f.policy,
      now: Date.now,
    });
    const continuation = new ToolContinuation(runtime, f.approvals);
    const intent =
      kind === "checked"
        ? { action: f.target, activation: "primary", argument }
        : { action: f.target, argument };
    const result = await continuation.start(tool, intent);
    if (result.kind === "approval_request") {
      approvals++;
      let finish!: (value: unknown) => void;
      const receiptPromise = new Promise((resolve) => {
        finish = resolve;
      });
      const card = approvalCard(document, result, async (response) => {
        finish(await continuation.respond(f.principal, response));
      });
      document.body.append(card);
      (card.querySelector("button.primary") as HTMLButtonElement).click();
      const receipt = (await receiptPromise) as {
        verification: string;
        commands: number;
        toolCallId: string;
      };
      assert(
        receipt.verification === "passed" &&
          receipt.commands === 1 &&
          receipt.toolCallId === result.toolCallId,
        `dispatch-${kind}`,
      );
      dispatches += receipt.commands;
    } else
      assert(
        result.noOp &&
          result.commands === 0 &&
          result.verification === "passed",
        `noop-${kind}`,
      );
    outcomes.push(`${kind}-${satisfied ? "noop" : "approved"}`);
    db.close();
  }
  for (const kind of ["fill", "select", "checked"] as const) {
    await run(kind);
    await run(kind, true);
  }
  for (const mode of [
    "hidden",
    "disabled",
    "readonly",
    "aria-disabled",
    "fieldset",
    "occluded",
    "file",
    "range",
    "date",
    "number",
    "password",
    "multiple",
    "duplicate",
  ] as const) {
    const f = await setup(mode === "multiple" ? "web.select" : "web.fill");
    const element = document.createElement(
      mode === "multiple" ? "select" : "input",
    );
    const wrap = document.createElement("fieldset");
    wrap.append(element);
    document.body.append(wrap);
    if (element instanceof HTMLInputElement)
      element.type = ["file", "range", "date", "number", "password"].includes(
        mode,
      )
        ? mode
        : "text";
    if (mode === "hidden") element.style.display = "none";
    if (mode === "disabled") element.disabled = true;
    if (mode === "readonly") (element as HTMLInputElement).readOnly = true;
    if (mode === "aria-disabled") element.setAttribute("aria-disabled", "true");
    if (mode === "fieldset") wrap.disabled = true;
    if (mode === "multiple") (element as HTMLSelectElement).multiple = true;
    let overlay: HTMLElement | null = null;
    if (mode === "occluded") {
      const rect = element.getBoundingClientRect();
      overlay = document.createElement("div");
      overlay.style.cssText = `position:fixed;z-index:9999;left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px;background:red`;
      document.body.append(overlay);
    }
    const adapter = await bindControl({
      element,
      tool: mode === "multiple" ? "web.select" : "web.fill",
      target: f.target,
      context: f.context,
      effect: f.effect,
      unique: () => mode !== "duplicate",
    });
    let rejected = false;
    try {
      await adapter.preflight("after");
    } catch {
      rejected = true;
    }
    assert(rejected, `unsafe-target-${mode}`);
    outcomes.push(`reject-${mode}`);
    wrap.remove();
    overlay?.remove();
  }
  return {
    outcomes,
    approvals,
    dispatches,
    noOps: 3,
    providerCalls: 0,
    goalVerified: false,
    scope:
      "Controlled DOM and card projection; fixture UI principal and intent port, not real extension sender/backend integration",
  };
}
