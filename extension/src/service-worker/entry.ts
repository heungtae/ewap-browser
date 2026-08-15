import { validateSemanticSnapshot } from "../contracts/semantic-snapshot.js";
import type { SemanticSnapshot } from "../contracts/types.js";
import { digestCanonical } from "../security/canonical.js";
import { ContractError } from "../security/validation.js";
import { ServiceCoordinator } from "./coordinator.js";
import type {
  ActionDefinition,
  ReadyExecution,
} from "../state/mutation-coordinator.js";
import type { Run } from "../state/run-coordinator.js";
import {
  LocalFixtureSessionBinding,
  type SessionBinding,
} from "../state/local-session-binding.js";

type Sender = {
  id?: string;
  url?: string;
  tab?: { id?: number };
  frameId?: number;
  documentId?: string;
  documentLifecycle?: string;
};
type BrowserRuntime = {
  id: string;
  getURL(path: string): string;
  onMessage: {
    addListener(
      listener: (
        message: unknown,
        sender: Sender,
        respond: (response: unknown) => void,
      ) => boolean | void,
    ): void;
  };
  lastError?: { message?: string };
};
type BrowserTabs = {
  query(query: {
    active: boolean;
    lastFocusedWindow: boolean;
  }): Promise<Array<{ id?: number }>>;
  sendMessage(tabId: number, message: unknown): Promise<unknown>;
};
type BrowserStorageArea = {
  setAccessLevel(level: { accessLevel: "TRUSTED_CONTEXTS" }): Promise<void>;
};
type BrowserStorage = {
  managed: BrowserStorageArea;
  local: BrowserStorageArea;
  session: BrowserStorageArea;
};
const chromeApi = (
  globalThis as typeof globalThis & {
    chrome?: {
      runtime: BrowserRuntime;
      tabs: BrowserTabs;
      storage: BrowserStorage;
    };
  }
).chrome;
const registered = new Map<string, string>();
const registrationKey = (tabId: number, frameId: number): string =>
  `${tabId}:${frameId}`;
const safeFailure = (code: string) => ({ ok: false, code });
const fixtureOrigin = "https://fixture.company.test:8443";
const fixtureProfile = { id: "development-fixture-local-ui-v1", version: 1 };
const localSessionBinding = new LocalFixtureSessionBinding();
const localBindings = new Map<string, SessionBinding>();
const coordinator = new ServiceCoordinator({
  permission_origins: [fixtureOrigin],
  page_read_origins: [fixtureOrigin],
  profile_resolver_origins: [],
  llm_egress_origins: [],
});
let storageReady = false;
void Promise.all([
  chromeApi?.storage.managed.setAccessLevel({
    accessLevel: "TRUSTED_CONTEXTS",
  }),
  chromeApi?.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }),
  chromeApi?.storage.session.setAccessLevel({
    accessLevel: "TRUSTED_CONTEXTS",
  }),
])
  .then(() => {
    storageReady = true;
    coordinator.completeStorageBootstrap(true);
  })
  .catch(() => {
    storageReady = false;
    coordinator.completeStorageBootstrap(false);
  });
const panelUrl = (): string | undefined =>
  chromeApi?.runtime.getURL("sidepanel/index.html");
const isPanelSender = (sender: Sender): boolean =>
  sender.id === chromeApi?.runtime.id && sender.url === panelUrl();
const exactKeys = (value: object, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key)) &&
  keys.every((key) => key in value);
const readActiveSnapshot = async (): Promise<{
  tabId: number;
  snapshot: SemanticSnapshot;
}> => {
  const tabs = await chromeApi!.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  const tabId = tabs[0]?.id;
  if (tabId === undefined)
    return Promise.reject(new ContractError("ORIGIN_NOT_ALLOWED"));
  const result = await chromeApi!.tabs.sendMessage(tabId, {
    kind: "CONTENT_SNAPSHOT",
  });
  if (
    typeof result !== "object" ||
    result === null ||
    !(result as { ok?: unknown }).ok
  )
    return Promise.reject(new ContractError("INVALID_ARGUMENT"));
  const payload = (result as { snapshot?: unknown }).snapshot;
  if (
    typeof payload !== "object" ||
    payload === null ||
    (payload as { origin?: unknown }).origin !== fixtureOrigin
  )
    return Promise.reject(new ContractError("ORIGIN_NOT_ALLOWED"));
  const snapshot = validateSemanticSnapshot(
    (payload as { snapshot: unknown }).snapshot,
  );
  if (registered.get(registrationKey(tabId, 0)) !== snapshot.document_epoch)
    return Promise.reject(new ContractError("DOCUMENT_NOT_REGISTERED"));
  return { tabId, snapshot };
};
const fixtureTextDefinition = (preStateDigest: string): ActionDefinition => ({
  tool: "set_text_by_ref",
  effect: "local-ui-only",
  risk: "R1",
  eligibleRoles: ["textbox"],
  verifier: {
    kind: "semantic-state-transition",
    declaration_id: "development-fixture-text-v1",
    pre_state_digest: preStateDigest,
    required_changes: [],
  },
});
const fixtureDefinition = (
  tool: "select_option_by_ref" | "set_checked_by_ref",
  refId: string,
  preStateDigest: string,
  checked?: boolean,
  r2 = false,
): ActionDefinition => ({
  tool,
  effect: r2 ? "server-side" : "local-ui-only",
  risk: r2 ? "R2" : "R1",
  eligibleRoles: tool === "select_option_by_ref" ? ["combobox"] : ["checkbox"],
  verifier: {
    kind: "semantic-state-transition",
    declaration_id:
      tool === "select_option_by_ref"
        ? "development-fixture-select-v1"
        : "development-fixture-checkbox-v1",
    pre_state_digest: preStateDigest,
    required_changes:
      tool === "set_checked_by_ref" && typeof checked === "boolean"
        ? [{ ref_id: refId, field: "checked", expected: checked }]
        : [],
  },
});
const executeFixture = (
  run: Run,
  ready: ReadyExecution,
  respond: (response: unknown) => void,
): void => {
  void chromeApi!.tabs
    .sendMessage(run.tabId, {
      kind: "CONTENT_EXECUTE_R1",
      intent: ready.intent,
      ...(ready.value !== undefined && ready.intent.value_binding
        ? {
            value_delivery: {
              value_slot_id: ready.intent.value_binding.value_slot_id,
              value_kind: ready.intent.value_binding.value_kind,
              value: ready.value,
            },
          }
        : {}),
    })
    .then((result) => {
      if (
        typeof result !== "object" ||
        result === null ||
        !(result as { ok?: unknown }).ok
      ) {
        coordinator.mutations.terminal(run, "FAILED");
        const code = (result as { code?: unknown }).code;
        return respond(
          safeFailure(
            code === "TARGET_STALE" || code === "VALUE_BINDING_INVALID"
              ? code
              : "TARGET_NOT_ACTIONABLE",
          ),
        );
      }
      coordinator.mutations.terminal(run, "VERIFIED");
      respond({ ok: true, outcome: "VERIFIED" });
    })
    .catch(() => {
      coordinator.mutations.terminal(run, "UNKNOWN");
      respond(safeFailure("INTERNAL_FAILURE"));
    });
};
chromeApi?.runtime.onMessage.addListener((message, sender, respond) => {
  if (!storageReady) {
    respond(safeFailure("STORAGE_BOUNDARY_UNAVAILABLE"));
    return;
  }
  if (typeof message !== "object" || message === null) {
    respond(safeFailure("INVALID_ARGUMENT"));
    return;
  }
  const kind = (message as { kind?: unknown }).kind;
  if (kind === "DOCUMENT_REGISTER") {
    const epoch = (message as { document_epoch?: unknown }).document_epoch;
    if (
      !exactKeys(message, ["schema_version", "kind", "document_epoch"]) ||
      (message as { schema_version?: unknown }).schema_version !== 1 ||
      typeof epoch !== "string" ||
      sender.id !== chromeApi.runtime.id ||
      sender.tab?.id === undefined ||
      sender.frameId === undefined ||
      !sender.documentId ||
      sender.documentLifecycle !== "active"
    ) {
      respond(safeFailure("INVALID_ARGUMENT"));
      return;
    }
    const key = registrationKey(sender.tab.id, sender.frameId);
    const previous = registered.get(key);
    if (previous && previous !== epoch) {
      const active = coordinator.runs.get(sender.tab.id);
      if (active) {
        const binding = localBindings.get(active.id);
        if (binding) localSessionBinding.clear(binding.id);
        localBindings.delete(active.id);
      }
      coordinator.invalidateDocument(sender.tab.id, epoch);
    }
    registered.set(key, epoch);
    respond({ ok: true });
    return;
  }
  if (kind === "START_ASK") {
    respond(safeFailure("PROFILE_UNAVAILABLE"));
    return;
  }
  if (kind === "CANCEL") {
    if (!isPanelSender(sender) || !exactKeys(message, ["kind"])) {
      respond(safeFailure("INVALID_ARGUMENT"));
      return;
    }
    void chromeApi!.tabs
      .query({ active: true, lastFocusedWindow: true })
      .then((tabs) => {
        const tabId = tabs[0]?.id;
        if (tabId === undefined)
          return respond(safeFailure("INVALID_ARGUMENT"));
        const run = coordinator.runs.get(tabId);
        if (run) {
          const binding = localBindings.get(run.id);
          if (binding) localSessionBinding.clear(binding.id);
          localBindings.delete(run.id);
        }
        coordinator.cancel(tabId);
        respond({ ok: true, outcome: "CANCELLED" });
      })
      .catch(() => respond(safeFailure("INTERNAL_FAILURE")));
    return true;
  }
  if (kind === "START_ACT") {
    const requestedTool = (message as { tool?: unknown }).tool;
    const requestedRef = (message as { ref_id?: unknown }).ref_id;
    const requestedChecked = (
      message as {
        argument?: { checked?: unknown };
      }
    ).argument?.checked;
    const requestedArgument = (message as { argument?: unknown }).argument;
    const validText =
      requestedTool === "set_text_by_ref" &&
      exactKeys(message, ["kind", "tool", "ref_id"]);
    const validSelect =
      requestedTool === "select_option_by_ref" &&
      exactKeys(message, ["kind", "tool", "ref_id"]);
    const validCheck =
      requestedTool === "set_checked_by_ref" &&
      exactKeys(message, ["kind", "tool", "ref_id", "argument"]) &&
      typeof requestedArgument === "object" &&
      requestedArgument !== null &&
      Object.keys(requestedArgument).length === 1 &&
      "checked" in requestedArgument &&
      typeof requestedChecked === "boolean";
    if (
      !isPanelSender(sender) ||
      !(validText || validSelect || validCheck) ||
      typeof requestedRef !== "string"
    ) {
      respond(safeFailure("PROFILE_UNAVAILABLE"));
      return;
    }
    void readActiveSnapshot()
      .then(({ tabId, snapshot }) => {
        const refId = requestedRef;
        const target = snapshot.nodes.find((node) => node.ref_id === refId);
        const roleMatches =
          (requestedTool === "set_text_by_ref" && target?.role === "textbox") ||
          (requestedTool === "select_option_by_ref" &&
            target?.role === "combobox") ||
          (requestedTool === "set_checked_by_ref" &&
            target?.role === "checkbox");
        if (!target || !roleMatches)
          return respond(safeFailure("TARGET_NOT_ACTIONABLE"));
        const previous = coordinator.runs.get(tabId);
        if (previous) {
          const binding = localBindings.get(previous.id);
          if (binding) localSessionBinding.clear(binding.id);
          localBindings.delete(previous.id);
        }
        coordinator.cancel(tabId);
        const run = coordinator.runs.start(
          tabId,
          0,
          snapshot.document_epoch,
          "act",
        );
        const r2FixtureTarget =
          requestedTool === "set_checked_by_ref" &&
          target.name === "Require confirmation";
        const binding = r2FixtureTarget
          ? localSessionBinding.issue(run.id, run.documentEpoch)
          : undefined;
        if (binding) localBindings.set(run.id, binding);
        const proposal =
          requestedTool === "set_text_by_ref"
            ? {
                tool: "set_text_by_ref" as const,
                target: "development-fixture-target",
              }
            : requestedTool === "select_option_by_ref"
              ? {
                  tool: "select_option_by_ref" as const,
                  target: "development-fixture-target",
                }
              : {
                  tool: "set_checked_by_ref" as const,
                  target: "development-fixture-target",
                  argument: { checked: requestedChecked as boolean },
                };
        const next = coordinator.mutations.propose(
          run,
          proposal,
          {
            refId,
            role: target.role,
            visible: target.visible,
            enabled: target.enabled,
            sensitive: false,
            stale: false,
          },
          fixtureProfile,
          requestedTool === "set_text_by_ref"
            ? fixtureTextDefinition(digestCanonical(target.state))
            : fixtureDefinition(
                requestedTool as "select_option_by_ref" | "set_checked_by_ref",
                refId,
                digestCanonical(target.state),
                requestedChecked as boolean | undefined,
                r2FixtureTarget,
              ),
          binding?.id,
        );
        if (next.state === "AWAITING_VALUE") {
          respond({
            ok: true,
            state: next.state,
            run_id: run.id,
            value_slot_id: next.valueSlotId,
            value_kind: next.valueKind,
          });
          return;
        }
        if (next.state === "READY_TO_EXECUTE") {
          const ready = coordinator.mutations.executeR1(run);
          executeFixture(run, ready, respond);
          return;
        }
        respond({
          ok: true,
          state: next.state,
          run_id: run.id,
          confirmation_id: next.confirmationId,
          confirmation_nonce: next.confirmationNonce,
        });
      })
      .catch((error) =>
        respond(
          safeFailure(
            error instanceof ContractError ? error.code : "ORIGIN_NOT_ALLOWED",
          ),
        ),
      );
    return true;
  }
  if (kind === "SUBMIT_ACTION_VALUE") {
    if (
      !isPanelSender(sender) ||
      !exactKeys(message, [
        "kind",
        "run_id",
        "value_slot_id",
        "value_kind",
        "value",
      ]) ||
      typeof (message as { run_id?: unknown }).run_id !== "string" ||
      typeof (message as { value_slot_id?: unknown }).value_slot_id !==
        "string" ||
      !["text", "option"].includes(
        (message as { value_kind?: unknown }).value_kind as string,
      ) ||
      typeof (message as { value?: unknown }).value !== "string"
    ) {
      respond(safeFailure("VALUE_BINDING_INVALID"));
      return;
    }
    const payload = message as {
      run_id: string;
      value_slot_id: string;
      value_kind: "text" | "option";
      value: string;
    };
    void chromeApi!.tabs
      .query({ active: true, lastFocusedWindow: true })
      .then((tabs) => {
        const tabId = tabs[0]?.id;
        const run =
          tabId === undefined ? undefined : coordinator.runs.get(tabId);
        if (!run || run.id !== payload.run_id || run.phase === "TERMINAL")
          return respond(safeFailure("VALUE_BINDING_INVALID"));
        try {
          coordinator.mutations.submitValue(
            run,
            payload.value_slot_id,
            payload.value,
          );
          const ready = coordinator.mutations.executeR1(run);
          if (ready.value === undefined || !ready.intent.value_binding)
            return respond(safeFailure("VALUE_BINDING_INVALID"));
          if (ready.intent.value_binding.value_kind !== payload.value_kind)
            return respond(safeFailure("VALUE_BINDING_INVALID"));
          executeFixture(run, ready, respond);
        } catch (error) {
          coordinator.mutations.terminal(run, "FAILED");
          respond(
            safeFailure(
              error instanceof ContractError
                ? error.code
                : "VALUE_BINDING_INVALID",
            ),
          );
        }
      })
      .catch(() => respond(safeFailure("INTERNAL_FAILURE")));
    return true;
  }
  if (kind === "CONFIRM") {
    if (
      !isPanelSender(sender) ||
      !exactKeys(message, [
        "kind",
        "run_id",
        "confirmation_id",
        "confirmation_nonce",
      ]) ||
      typeof (message as { run_id?: unknown }).run_id !== "string" ||
      typeof (message as { confirmation_id?: unknown }).confirmation_id !==
        "string" ||
      typeof (message as { confirmation_nonce?: unknown })
        .confirmation_nonce !== "string"
    ) {
      respond(safeFailure("CONFIRMATION_INVALID"));
      return;
    }
    const payload = message as {
      run_id: string;
      confirmation_id: string;
      confirmation_nonce: string;
    };
    void chromeApi!.tabs
      .query({ active: true, lastFocusedWindow: true })
      .then((tabs) => {
        const tabId = tabs[0]?.id;
        const run =
          tabId === undefined ? undefined : coordinator.runs.get(tabId);
        const binding = run ? localBindings.get(run.id) : undefined;
        if (
          !run ||
          run.id !== payload.run_id ||
          run.phase !== "AWAITING_CONFIRMATION" ||
          !binding
        )
          return respond(safeFailure("CONFIRMATION_INVALID"));
        try {
          localSessionBinding.verify(binding, run.id, run.documentEpoch);
          const ready = coordinator.mutations.confirm(
            run,
            payload.confirmation_id,
            payload.confirmation_nonce,
          );
          localSessionBinding.clear(binding.id);
          localBindings.delete(run.id);
          executeFixture(run, ready, respond);
        } catch (error) {
          localSessionBinding.clear(binding.id);
          localBindings.delete(run.id);
          coordinator.mutations.terminal(run, "FAILED");
          respond(
            safeFailure(
              error instanceof ContractError
                ? error.code
                : "CONFIRMATION_INVALID",
            ),
          );
        }
      })
      .catch(() => respond(safeFailure("INTERNAL_FAILURE")));
    return true;
  }
  if (!isPanelSender(sender)) {
    respond(safeFailure("INVALID_ARGUMENT"));
    return;
  }
  if (kind !== "START_PREVIEW") {
    respond(safeFailure("INVALID_ARGUMENT"));
    return;
  }
  if (!exactKeys(message, ["kind"])) {
    respond(safeFailure("INVALID_ARGUMENT"));
    return;
  }
  void readActiveSnapshot()
    .then(({ tabId, snapshot }) => {
      try {
        const preview = coordinator.preview(
          tabId,
          0,
          snapshot.document_epoch,
          fixtureOrigin,
          snapshot,
        );
        respond({ ok: true, snapshot: preview });
      } catch (error) {
        respond(
          safeFailure(
            error instanceof ContractError ? error.code : "ORIGIN_NOT_ALLOWED",
          ),
        );
      }
    })
    .catch((error) =>
      respond(
        safeFailure(
          error instanceof ContractError ? error.code : "ORIGIN_NOT_ALLOWED",
        ),
      ),
    );
  return true;
});
