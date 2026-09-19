import type { Capability } from "../policy/permission-manager.js";
import type { BrowserChromeApi, BrowserSender } from "./browser-api.js";
import type { ServiceCoordinator } from "./coordinator.js";
import { CollectionReadOrchestrator } from "./collection-read-orchestrator.js";
import { collectionReaderRegistry } from "./collection-reader-registry.js";
import type {
  CollectionReadRequest,
  CollectionReadDescriptor,
} from "../contracts/collection-read-types.js";
import { withDeadline } from "../security/deadline.js";

type PermissionRequest = {
  capability: Capability;
  origin: string;
  expiresAt: number;
  act_session_id?: string;
};

type CollectionReadDependencies = {
  chrome: BrowserChromeApi;
  coordinator: ServiceCoordinator;
  permissions: {
    check(
      capability: Capability,
      origin: string,
      runId: string,
    ): "ALLOW" | "DENY" | "REQUIRE_PERMISSION";
    decide(
      capability: Capability,
      origin: string,
      runId: string,
      decision: "once" | "always" | "deny",
    ): void;
    endRun(runId: string): void;
  };
  requests: Map<string, PermissionRequest>;
  isPanelSender(sender: BrowserSender): boolean;
  isPanelOrSettingsSender(sender: BrowserSender): boolean;
  safeFailure(code: string, detail?: string): Record<string, unknown>;
};

export const createCollectionReadMessageHandler = (
  dependencies: CollectionReadDependencies,
) => {
  const handleCollectionDiscover = async (
    sender: BrowserSender,
    respond: (response: unknown) => void,
  ): Promise<void> => {
    if (
      !dependencies.isPanelSender(sender) &&
      !dependencies.isPanelOrSettingsSender(sender)
    ) {
      respond(dependencies.safeFailure("PERMISSION_DENIED"));
      return;
    }

    try {
      const tabId = sender.tab?.id;
      if (tabId === undefined) {
        respond(dependencies.safeFailure("INVALID_ARGUMENT"));
        return;
      }
      const collections = await withDeadline(
        dependencies.chrome.tabs.sendMessage(tabId, {
          kind: "CONTENT_COLLECTION_DISCOVER",
        }),
        10_000,
        "REQUEST_TIMEOUT",
      );
      respond({ ok: true, result: collections as unknown });
    } catch (error) {
      respond(
        dependencies.safeFailure("COLLECTION_DISCOVER_FAILED", String(error)),
      );
    }
  };

  const handleCollectionFind = async (
    sender: BrowserSender,
    xpath: string,
    respond: (response: unknown) => void,
  ): Promise<void> => {
    if (
      !dependencies.isPanelSender(sender) &&
      !dependencies.isPanelOrSettingsSender(sender)
    ) {
      respond(dependencies.safeFailure("PERMISSION_DENIED"));
      return;
    }

    try {
      const tabId = sender.tab?.id;
      if (tabId === undefined) {
        respond(dependencies.safeFailure("INVALID_ARGUMENT"));
        return;
      }
      const collection = await withDeadline(
        dependencies.chrome.tabs.sendMessage(tabId, {
          kind: "CONTENT_COLLECTION_FIND",
          xpath,
        }),
        10_000,
        "REQUEST_TIMEOUT",
      );
      respond({ ok: true, result: collection as unknown });
    } catch (error) {
      respond(
        dependencies.safeFailure("COLLECTION_FIND_FAILED", String(error)),
      );
    }
  };

  const handleCollectionReadStart = async (
    sender: BrowserSender,
    request: CollectionReadRequest,
    descriptor: CollectionReadDescriptor,
    respond: (response: unknown) => void,
  ): Promise<void> => {
    if (!dependencies.isPanelSender(sender)) {
      respond(dependencies.safeFailure("PERMISSION_DENIED"));
      return;
    }

    const permission = dependencies.permissions.check(
      "collection_read",
      request.origin,
      request.run_id,
    );

    if (permission === "DENY") {
      respond(dependencies.safeFailure("PERMISSION_DENIED"));
      return;
    }

    if (permission === "REQUIRE_PERMISSION") {
      const requestId = crypto.randomUUID();
      dependencies.requests.set(requestId, {
        capability: "collection_read",
        origin: request.origin,
        expiresAt: Date.now() + 60_000,
        act_session_id: request.run_id,
      });
      respond({
        ok: false,
        code: "REQUIRE_PERMISSION",
        request_id: requestId,
      } as unknown as { ok: false; code: string; request_id: string });
      return;
    }

    const reader = collectionReaderRegistry.selectReader(descriptor);
    if (!reader) {
      respond(dependencies.safeFailure("NO_READER_FOR_OBJECT_KIND"));
      return;
    }

    if (!reader.supports_mode.includes(request.mode)) {
      respond(dependencies.safeFailure("MODE_NOT_SUPPORTED"));
      return;
    }

    try {
      const result = await CollectionReadOrchestrator.start(
        request,
        descriptor,
      );
      respond(result);
    } catch (error) {
      respond(
        dependencies.safeFailure("COLLECTION_READ_FAILED", String(error)),
      );
    }
  };

  const handleCollectionReadCancel = async (
    respond: (response: unknown) => void,
  ): Promise<void> => {
    CollectionReadOrchestrator.cancel();
    respond({ ok: true });
  };

  const handleCollectionReadState = async (
    respond: (response: unknown) => void,
  ): Promise<void> => {
    const state = CollectionReadOrchestrator.getState();
    respond({ ok: true, state });
  };

  return {
    handleCollectionDiscover,
    handleCollectionFind,
    handleCollectionReadStart,
    handleCollectionReadCancel,
    handleCollectionReadState,
  };
};
