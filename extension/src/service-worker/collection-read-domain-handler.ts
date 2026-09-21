import type { Capability } from "../policy/permission-manager.js";
import type { BrowserSender } from "./browser-api.js";
import type { DomainMessageHandler } from "./domain-message-router.js";
import type { RoutedMessage } from "./runtime-message-router.js";
import { createCollectionReadMessageHandler } from "./collection-read-message-handler.js";
import type { BrowserChromeApi } from "./browser-api.js";
import type { PermissionManager } from "../policy/permission-manager.js";

type PermissionRequest = {
  capability: Capability;
  origin: string;
  expiresAt: number;
  act_session_id?: string;
};

type Dependencies = {
  chrome: BrowserChromeApi;
  permissions: PermissionManager;
  requests: Map<string, PermissionRequest>;
  activeTabForBoundPanel(
    sender: BrowserSender,
  ): Promise<{ id: number; url?: string }>;
  documentFor(tabId: number): { epoch: string; documentId: string } | undefined;
  scopeFor(
    tabId: number,
  ): { document_epoch: string; page_scope_epoch: string } | undefined;
  isPanelSender(sender: BrowserSender): boolean;
  isPanelOrSettingsSender(sender: BrowserSender): boolean;
  safeFailure(code: string, detail?: string): Record<string, unknown>;
};

export const createCollectionReadDomainHandler = (
  dependencies: Dependencies,
): DomainMessageHandler => {
  const handler = createCollectionReadMessageHandler({
    chrome: dependencies.chrome,
    permissions: dependencies.permissions,
    requests: dependencies.requests,
    activeTabForBoundPanel: dependencies.activeTabForBoundPanel,
    documentFor: dependencies.documentFor,
    scopeFor: dependencies.scopeFor,
    isPanelSender: dependencies.isPanelSender,
    isPanelOrSettingsSender: dependencies.isPanelOrSettingsSender,
    safeFailure: dependencies.safeFailure,
  });

  return {
    handle(message, sender, respond): RoutedMessage {
      if (
        typeof message === "object" &&
        message !== null &&
        (message as { kind?: unknown }).kind === "COLLECTION_DISCOVER"
      ) {
        handler.handleCollectionDiscover(sender, respond);
        return { handled: true, keepAlive: true };
      }

      if (
        typeof message === "object" &&
        message !== null &&
        (message as { kind?: unknown }).kind === "COLLECTION_READ_NEXT"
      ) {
        handler.handleCollectionReadNext(
          sender,
          (message as { request?: unknown }).request,
          respond,
        );
        return { handled: true, keepAlive: true };
      }

      if (
        typeof message === "object" &&
        message !== null &&
        (message as { kind?: unknown }).kind === "COLLECTION_READ_START"
      ) {
        const request = (message as { request?: unknown }).request;
        if (!request) {
          respond(dependencies.safeFailure("INVALID_ARGUMENT"));
          return { handled: true };
        }
        handler.handleCollectionReadStart(sender, request, respond);
        return { handled: true, keepAlive: true };
      }

      if (
        typeof message === "object" &&
        message !== null &&
        (message as { kind?: unknown }).kind === "COLLECTION_READ_CANCEL"
      ) {
        handler.handleCollectionReadCancel(respond);
        return { handled: true };
      }

      if (
        typeof message === "object" &&
        message !== null &&
        (message as { kind?: unknown }).kind === "COLLECTION_READ_STATE"
      ) {
        handler.handleCollectionReadState(respond);
        return { handled: true };
      }

      return { handled: false };
    },
  };
};
