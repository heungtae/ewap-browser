import { exactKeys } from "./runtime-message-router.js";
import type { BrowserSender } from "./browser-api.js";

type Respond = (response: unknown) => void;
type RegisteredDocument = { epoch: string; documentId: string };
type PageScope = { document_epoch: string; page_scope_epoch: string };
type ActiveRun = { phase: string; documentEpoch: string };

type Dependencies = {
  extensionId(): string | undefined;
  registrationKey(tabId: number, frameId: number): string;
  registered: Map<string, RegisteredDocument>;
  pageScopes: Map<number, PageScope>;
  stalePageTabs: Set<number>;
  activeRun(tabId: number): ActiveRun | undefined;
  cancelRunForPageChange(run: ActiveRun): void;
  safeFailure(code: string): unknown;
};

export const createPageLifecycleMessageHandler = (
  dependencies: Dependencies,
) => ({
  handle(
    message: object,
    sender: BrowserSender,
    respond: Respond,
  ): { handled: boolean } {
    const kind = (message as { kind?: unknown }).kind;
    if (kind === "DOCUMENT_REGISTER") {
      const epoch = (message as { document_epoch?: unknown }).document_epoch;
      if (
        !exactKeys(message, ["schema_version", "kind", "document_epoch"]) ||
        (message as { schema_version?: unknown }).schema_version !== 1 ||
        typeof epoch !== "string" ||
        sender.id !== dependencies.extensionId() ||
        sender.tab?.id === undefined ||
        sender.frameId === undefined ||
        !sender.documentId ||
        sender.documentLifecycle !== "active"
      ) {
        respond(dependencies.safeFailure("INVALID_ARGUMENT"));
        return { handled: true };
      }
      const key = dependencies.registrationKey(sender.tab.id, sender.frameId);
      const previous = dependencies.registered.get(key);
      if (previous && previous.epoch !== epoch) {
        const active = dependencies.activeRun(sender.tab.id);
        if (active && active.phase !== "VERIFYING_NAVIGATION")
          dependencies.cancelRunForPageChange(active);
      }
      dependencies.registered.set(key, {
        epoch,
        documentId: sender.documentId,
      });
      dependencies.pageScopes.set(sender.tab.id, {
        document_epoch: epoch,
        page_scope_epoch: epoch,
      });
      respond({ ok: true });
      return { handled: true };
    }
    if (kind !== "PAGE_SCOPE_REGISTER") return { handled: false };
    const documentEpoch = (message as { document_epoch?: unknown })
      .document_epoch;
    const pageScopeEpoch = (message as { page_scope_epoch?: unknown })
      .page_scope_epoch;
    if (
      !exactKeys(message, [
        "schema_version",
        "kind",
        "document_epoch",
        "page_scope_epoch",
      ]) ||
      (message as { schema_version?: unknown }).schema_version !== 1 ||
      typeof documentEpoch !== "string" ||
      typeof pageScopeEpoch !== "string" ||
      sender.id !== dependencies.extensionId() ||
      sender.tab?.id === undefined ||
      sender.frameId !== 0 ||
      !sender.documentId ||
      dependencies.registered.get(
        dependencies.registrationKey(sender.tab.id, sender.frameId),
      )?.epoch !== documentEpoch
    ) {
      respond(dependencies.safeFailure("INVALID_ARGUMENT"));
      return { handled: true };
    }
    const previousScope = dependencies.pageScopes.get(sender.tab.id);
    dependencies.pageScopes.set(sender.tab.id, {
      document_epoch: documentEpoch,
      page_scope_epoch: pageScopeEpoch,
    });
    dependencies.stalePageTabs.delete(sender.tab.id);
    const active = dependencies.activeRun(sender.tab.id);
    if (
      active &&
      active.phase !== "VERIFYING_NAVIGATION" &&
      (active.documentEpoch !== documentEpoch ||
        previousScope?.page_scope_epoch !== pageScopeEpoch)
    )
      dependencies.cancelRunForPageChange(active);
    respond({ ok: true });
    return { handled: true };
  },
});
