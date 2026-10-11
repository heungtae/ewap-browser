import type {
  Dependencies,
  Selection,
  Respond,
} from "./workflow-analysis-types.js";
import {
  approvalDecision,
  createApprovalGrant,
  approvalEpoch,
} from "./approval-runtime.js";
import { exactKeys } from "./runtime-message-router.js";
import type { BrowserSender } from "./browser-api.js";
import { ContractError } from "../security/validation.js";

export const createWorkflowAnalysisMessageHandler = (
  dependencies: Dependencies,
) => {
  const analyze = (
    selection: Selection,
    respond: Respond,
    userApproved: boolean,
  ): void => {
    const issuedEpoch = approvalEpoch();
    void dependencies
      .active()
      .then(async (active) => {
        if (
          active.tabId !== selection.tabId ||
          active.origin !== selection.origin ||
          active.snapshot.document_epoch !== selection.documentEpoch
        )
          return respond(dependencies.safeFailure("WORKFLOW_STATE_MISMATCH"));
        createApprovalGrant({
          category: "source_disclosure",
          source: userApproved ? "user" : "policy",
          binding: selection.id,
          current: () =>
            issuedEpoch === approvalEpoch() &&
            dependencies.selection(selection.id) === selection,
        })();
        const source = await dependencies.source(selection);
        if (issuedEpoch !== approvalEpoch())
          throw new ContractError("POLICY_DENIED");
        const controls = active.snapshot.nodes
          .filter(
            (node) =>
              node.visible &&
              [
                "button",
                "checkbox",
                "combobox",
                "radio",
                "tab",
                "menuitem",
              ].includes(node.role),
          )
          .map((node) => ({
            role: node.role,
            name: node.name,
            enabled: node.enabled,
          }));
        const answer = await dependencies.chat({
          messages: [
            { role: "system", content: dependencies.systemPrompt },
            {
              role: "user",
              content:
                `[CURRENT_PAGE_CONTROLS]${JSON.stringify(controls)}[/CURRENT_PAGE_CONTROLS]\n` +
                `[UNTRUSTED_PAGE_CODE]${source}[/UNTRUSTED_PAGE_CODE]`,
            },
          ],
        });
        if (issuedEpoch !== approvalEpoch())
          throw new ContractError("POLICY_DENIED");
        if (answer.tool_calls.length || !answer.content)
          return respond(dependencies.safeFailure("PROVIDER_UNAVAILABLE"));
        const declaration = dependencies.parse(answer.content);
        if (!dependencies.targetsMatch(active.snapshot, declaration))
          return respond(dependencies.safeFailure("WORKFLOW_STATE_MISMATCH"));
        const candidate = dependencies.candidate(declaration, active);
        await dependencies.save(selection, candidate);
        respond({
          ok: true,
          state: "WORKFLOW_CANDIDATE",
          selection_id: selection.id,
          candidate: candidate.candidate,
        });
      })
      .catch((error) =>
        respond(
          dependencies.safeFailure(
            error instanceof ContractError
              ? error.code
              : "PROVIDER_UNAVAILABLE",
          ),
        ),
      );
  };
  return {
    handle(
      message: object,
      sender: BrowserSender,
      respond: Respond,
    ): { handled: boolean; keepAlive?: boolean } {
      const kind = (message as { kind?: unknown }).kind;
      const id = (message as { selection_id?: unknown }).selection_id;
      const selection =
        typeof id === "string" ? dependencies.selection(id) : undefined;
      if (kind === "WORKFLOW_ANALYZE") {
        if (
          !dependencies.isPanelSender(sender) ||
          !exactKeys(message, ["kind", "selection_id", "consent"]) ||
          !selection ||
          (message as { consent?: unknown }).consent !== true
        ) {
          respond(dependencies.safeFailure("INVALID_ARGUMENT"));
          return { handled: true };
        }
        analyze(selection, respond, true);
        return { handled: true, keepAlive: true };
      }
      if (kind !== "WORKFLOW_ANALYSIS_PREVIEW") return { handled: false };
      if (
        !dependencies.isPanelSender(sender) ||
        !exactKeys(message, ["kind", "selection_id"]) ||
        !selection
      ) {
        respond(dependencies.safeFailure("INVALID_ARGUMENT"));
        return { handled: true };
      }
      const decision = approvalDecision("source_disclosure");
      if (decision === "deny") {
        respond(dependencies.safeFailure("POLICY_DENIED"));
        return { handled: true };
      }
      if (decision === "auto") {
        analyze(selection, respond, false);
        return { handled: true, keepAlive: true };
      }
      void dependencies
        .preview(selection.tabId, selection.documentEpoch)
        .then((preview) => {
          if (!("scripts" in preview))
            return respond(dependencies.safeFailure("WORKFLOW_STATE_MISMATCH"));
          respond({
            ok: true,
            state: "WORKFLOW_ANALYSIS_CONSENT",
            selection_id: selection.id,
            script_count: preview.script_count,
            origins: preview.origins,
            inline_chars: preview.inline_chars,
          });
        })
        .catch(() =>
          respond(dependencies.safeFailure("WORKFLOW_STATE_MISMATCH")),
        );
      return { handled: true, keepAlive: true };
    },
  };
};
