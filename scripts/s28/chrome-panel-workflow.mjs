import { evaluate, waitFor } from "../chrome-cdp-utils.mjs";
export async function qualifyWorkflowCases(
  panel,
  { fixture, prompt, capture },
) {
  const candidate = {
    id: "s26-recorded-workflow",
    source: "recorded",
    title: "S26 recorded workflow",
    origin: "https://fixture.test",
    path_prefix: "/",
    step_count: 2,
    status: "verified",
    detail: "Controlled presentation fixture; no execution authority",
  };
  const nextRun = "workflow-presentation-run",
    nextRequest = "workflow-presentation-request";
  const workflowPrompt = () => ({ ...prompt(), requestId: nextRequest });
  const workflowEmit = async (type, fields) => {
    const seq = await evaluate(
      panel,
      `${fixture}.emit(${JSON.stringify({ runId: nextRun, requestId: nextRequest, type, ...fields })})`,
    );
    await evaluate(panel, `${fixture}.tick();true`);
    await waitFor(
      () => evaluate(panel, `${fixture}.state().cursor===${seq}`),
      3000,
      "WORKFLOW_PRESENTED",
    );
  };
  await workflowEmit("run_started", {
    mode: "act",
    permission_mode: "custom",
  });
  await workflowEmit("message", {
    role: "user",
    text: "Show the fixture workflow",
  });
  await workflowEmit("workflow_candidates", {
    prompt: workflowPrompt(),
    candidates: [candidate],
    appendOnly: false,
  });
  await capture("workflow-candidates");
  await evaluate(
    panel,
    "document.querySelector('[data-workflow-selection-id] button.primary').click();true",
  );
  await waitFor(
    () =>
      evaluate(
        panel,
        `${fixture}.responses().at(-1)?.kind==='workflow.select'`,
      ),
    3000,
    "WORKFLOW_SELECTED",
  );
  await workflowEmit("workflow_preview", {
    prompt: workflowPrompt(),
    candidate,
  });
  await capture("workflow-preview");
  await evaluate(
    panel,
    "document.querySelector('#diagnostics-dialog').showModal();true",
  );
  await capture("diagnostics-dialog");
  await evaluate(
    panel,
    "document.querySelector('#diagnostics-dialog-close').click();true",
  );
}
