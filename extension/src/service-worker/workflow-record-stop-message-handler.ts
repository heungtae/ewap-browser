import { validateWorkflowDeclaration } from "../contracts/workflow.js";
import type { SemanticSnapshot } from "../contracts/types.js";
import { ContractError, fail, isPlainObject } from "../security/validation.js";
import type { BrowserSender } from "./browser-api.js";
import { exactKeys } from "./runtime-message-router.js";

type Respond = (response: unknown) => void;
type Recording = {
  tabId: number;
  documentEpoch: string;
  origin: string;
  path: string;
};
type Active = {
  tabId: number;
  origin: string;
  path: string;
  snapshot: SemanticSnapshot;
};
type Dependencies = {
  isPanelSender(sender: BrowserSender): boolean;
  recordings: Map<string, Recording>;
  send(tabId: number, message: unknown): Promise<unknown>;
  createId(): string;
  active(): Promise<Active>;
  record(
    declaration: ReturnType<typeof validateWorkflowDeclaration>,
    active: Active,
    title: string,
  ): Promise<unknown>;
  safeFailure(code: string): unknown;
};

export const createWorkflowRecordStopMessageHandler = (
  dependencies: Dependencies,
) => ({
  handle(
    message: object,
    sender: BrowserSender,
    respond: Respond,
  ): { handled: boolean; keepAlive?: boolean } {
    if ((message as { kind?: unknown }).kind !== "WORKFLOW_RECORD_STOP")
      return { handled: false };
    const id = (message as { recording_id?: unknown }).recording_id;
    const recording =
      typeof id === "string" ? dependencies.recordings.get(id) : undefined;
    if (
      !dependencies.isPanelSender(sender) ||
      !exactKeys(message, ["kind", "recording_id"]) ||
      !recording ||
      typeof id !== "string"
    ) {
      respond(dependencies.safeFailure("INVALID_ARGUMENT"));
      return { handled: true };
    }
    void (async () => {
      const result = await dependencies.send(recording.tabId, {
        kind: "CONTENT_WORKFLOW_RECORD_STOP",
        recording_id: id,
      });
      dependencies.recordings.delete(id);
      if (
        !isPlainObject(result) ||
        result.ok !== true ||
        result.document_epoch !== recording.documentEpoch ||
        !Array.isArray(result.steps) ||
        result.steps.length === 0 ||
        result.steps.length > 12
      )
        return respond(dependencies.safeFailure("WORKFLOW_STATE_MISMATCH"));
      const recordedSteps = result.steps as unknown[];
      const steps = recordedSteps.map((item, index) => {
        if (
          !isPlainObject(item) ||
          !isPlainObject(item.target) ||
          typeof item.tool !== "string" ||
          typeof item.target.role !== "string" ||
          typeof item.target.name !== "string"
        )
          return fail("INVALID_ARGUMENT");
        return {
          id: `step-${index + 1}`,
          tool: item.tool,
          target: { role: item.target.role, name: item.target.name },
          ...(index + 1 < recordedSteps.length
            ? { next: `step-${index + 2}` }
            : {}),
        };
      });
      const title = "내가 기록한 워크플로우";
      const declaration = validateWorkflowDeclaration({
        schema_version: 1,
        id: dependencies.createId(),
        title,
        steps,
      });
      const active = await dependencies.active();
      if (
        active.tabId !== recording.tabId ||
        active.origin !== recording.origin ||
        active.path !== recording.path ||
        active.snapshot.document_epoch !== recording.documentEpoch
      )
        return respond(dependencies.safeFailure("WORKFLOW_STATE_MISMATCH"));
      respond({
        ok: true,
        record: await dependencies.record(declaration, active, title),
      });
    })().catch((error) =>
      respond(
        dependencies.safeFailure(
          error instanceof ContractError
            ? error.code
            : "STORAGE_BOUNDARY_UNAVAILABLE",
        ),
      ),
    );
    return { handled: true, keepAlive: true };
  },
});
