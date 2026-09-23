import type { DiscoveryResult } from "../page-api/discovery/discovery-types.js";
import type { BrowserSender } from "./browser-api.js";
import type { DomainMessageHandler } from "./domain-message-router.js";

type Dependencies = {
  activeTabForBoundPanel(
    sender: BrowserSender,
  ): Promise<{ id: number; url?: string }>;
  isPanelSender(sender: BrowserSender): boolean;
  ensureDocument(tabId: number): Promise<void>;
  documentFor(tabId: number): { epoch: string; documentId: string } | undefined;
  scopeFor(
    tabId: number,
  ): { document_epoch: string; page_scope_epoch: string } | undefined;
  authorize(input: {
    tabId: number;
    documentEpoch: string;
    origin: string;
  }): Promise<boolean>;
  start(input: {
    tabId: number;
    documentId: string;
    documentEpoch: string;
    pageScopeEpoch: string;
  }): Promise<DiscoveryResult>;
  cancel(tabId: number): void;
  safeFailure(code: string): unknown;
};

const originFor = (value: string | undefined): string | undefined => {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.origin
      : undefined;
  } catch {
    return undefined;
  }
};

export const createPageApiDiscoveryDomainHandler = (
  dependencies: Dependencies,
): DomainMessageHandler => ({
  handle(message, sender, respond) {
    const kind = (message as { kind?: unknown }).kind;
    if (
      kind !== "PAGE_API_DISCOVERY_START" &&
      kind !== "PAGE_API_DISCOVERY_STOP"
    )
      return { handled: false };
    if (
      !dependencies.isPanelSender(sender) ||
      Object.keys(message).length !== 1
    ) {
      respond(dependencies.safeFailure("INVALID_ARGUMENT"));
      return { handled: true };
    }
    if (kind === "PAGE_API_DISCOVERY_STOP") {
      void dependencies
        .activeTabForBoundPanel(sender)
        .then((active) => {
          dependencies.cancel(active.id);
          respond({ ok: true });
        })
        .catch(() =>
          respond(dependencies.safeFailure("PANEL_CONTEXT_UNAVAILABLE")),
        );
      return { handled: true, keepAlive: true };
    }
    void dependencies
      .activeTabForBoundPanel(sender)
      .then(async (active) => {
        const origin = originFor(active.url);
        // Service-worker restart clears the in-memory document registry. The
        // content script re-registers the current document only; it never
        // discovers a different tab, frame, or page scope on this path.
        if (!dependencies.documentFor(active.id))
          await dependencies.ensureDocument(active.id);
        const document = dependencies.documentFor(active.id);
        const scope = dependencies.scopeFor(active.id);
        if (
          !origin ||
          !document ||
          !scope ||
          scope.document_epoch !== document.epoch
        ) {
          respond(dependencies.safeFailure("PAGE_SCOPE_STALE"));
          return;
        }
        if (
          !(await dependencies.authorize({
            tabId: active.id,
            documentEpoch: document.epoch,
            origin,
          }))
        ) {
          respond({
            ok: true,
            result: {
              candidates: [],
              truncated: false,
              terminal: "POLICY_DENIED",
              duration_ms: 0,
            } satisfies DiscoveryResult,
          });
          return;
        }
        const result = await dependencies.start({
          tabId: active.id,
          documentId: document.documentId,
          documentEpoch: document.epoch,
          pageScopeEpoch: scope.page_scope_epoch,
        });
        respond({ ok: true, result });
      })
      .catch(() => respond(dependencies.safeFailure("INTERNAL_FAILURE")));
    return { handled: true, keepAlive: true };
  },
});
