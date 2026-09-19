import type { Capability } from "../policy/permission-manager.js";
import type { BrowserSender } from "./browser-api.js";
import type { DomainMessageHandler } from "./domain-message-router.js";
import type { RoutedMessage } from "./runtime-message-router.js";
import type {
  CollectionReadRequest,
  CollectionReadDescriptor,
} from "../contracts/collection-read-types.js";
import { createCollectionReadMessageHandler } from "./collection-read-message-handler.js";
import type { ServiceCoordinator } from "./coordinator.js";
import type { BrowserChromeApi } from "./browser-api.js";
import type { PermissionManager } from "../policy/permission-manager.js";
import type { PlanScopeStore } from "../policy/plan-scope.js";

type PermissionRequest = {
  capability: Capability;
  origin: string;
  expiresAt: number;
  act_session_id?: string;
};

type Dependencies = {
  chrome: BrowserChromeApi;
  coordinator: ServiceCoordinator;
  permissions: PermissionManager;
  requests: Map<string, PermissionRequest>;
  planScopes: PlanScopeStore;
  isPanelSender(sender: BrowserSender): boolean;
  isPanelOrSettingsSender(sender: BrowserSender): boolean;
  safeFailure(code: string, detail?: string): Record<string, unknown>;
};

export const createCollectionReadDomainHandler = (
  dependencies: Dependencies,
): DomainMessageHandler => {
  const handler = createCollectionReadMessageHandler({
    chrome: dependencies.chrome,
    coordinator: dependencies.coordinator,
    permissions: dependencies.permissions,
    requests: dependencies.requests,
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
        return { handled: true };
      }

      if (
        typeof message === "object" &&
        message !== null &&
        (message as { kind?: unknown }).kind === "COLLECTION_FIND"
      ) {
        const xpath = (message as { xpath?: unknown }).xpath;
        if (typeof xpath !== "string") {
          respond(dependencies.safeFailure("INVALID_ARGUMENT"));
          return { handled: true };
        }
        handler.handleCollectionFind(sender, xpath, respond);
        return { handled: true };
      }

      if (
        typeof message === "object" &&
        message !== null &&
        (message as { kind?: unknown }).kind === "COLLECTION_READ_START"
      ) {
        const request = (message as { request?: unknown }).request;
        const descriptor = (message as { descriptor?: unknown }).descriptor;
        if (!request || !descriptor) {
          respond(dependencies.safeFailure("INVALID_ARGUMENT"));
          return { handled: true };
        }
        handler.handleCollectionReadStart(
          sender,
          request as CollectionReadRequest,
          descriptor as CollectionReadDescriptor,
          respond,
        );
        return { handled: true };
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
