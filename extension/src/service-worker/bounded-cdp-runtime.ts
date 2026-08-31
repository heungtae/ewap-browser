import { BoundedCdpAdapter } from "../cdp/bounded-adapter.js";
import { fail } from "../security/validation.js";
import type { BrowserChromeApi } from "./browser-api.js";

type Dependencies = {
  chrome: BrowserChromeApi | undefined;
  authorized(runId: string): boolean;
};

export const createBoundedCdpRuntime = (dependencies: Dependencies) => {
  const chrome = dependencies.chrome;
  const markerStore = {
    async set(marker: {
      tabId: number;
      runId: string;
      actionId: string;
      phase: "attaching" | "attached";
    }): Promise<void> {
      await chrome?.storage.session.set?.({ contextpilot_cdp_marker: marker });
    },
    async clear(tabId: number): Promise<void> {
      const stored = await chrome?.storage.session.get?.(
        "contextpilot_cdp_marker",
      );
      const marker = stored?.contextpilot_cdp_marker;
      if (
        typeof marker !== "object" ||
        marker === null ||
        (marker as { tabId?: unknown }).tabId === tabId
      )
        await chrome?.storage.session.set?.({ contextpilot_cdp_marker: null });
    },
  };
  const boundedCdp = chrome?.debugger
    ? new BoundedCdpAdapter(
        chrome.debugger,
        markerStore,
        {
          async prepare(action) {
            const result = await chrome.tabs.sendMessage(action.tabId, {
              kind: "PREPARE_BOUNDED_CDP_TARGET",
              run_id: action.runId,
              action_id: action.actionId,
              tab_id: action.tabId,
              frame_id: action.frameId,
              document_id: action.documentId,
              document_epoch: action.documentEpoch,
              ref_id: action.refId,
              action_token: action.actionToken,
            });
            if (
              typeof result !== "object" ||
              result === null ||
              !(result as { ok?: unknown }).ok
            )
              return fail("TARGET_NOT_ACTIONABLE");
            const prepared = result as Record<string, unknown>;
            const fields = [
              "unique",
              "sensitive",
              "stale",
              "visible",
              "enabled",
              "occluded",
            ];
            if (!fields.every((field) => typeof prepared[field] === "boolean"))
              return fail("TARGET_NOT_ACTIONABLE");
            return {
              unique: prepared.unique as boolean,
              sensitive: prepared.sensitive as boolean,
              stale: prepared.stale as boolean,
              visible: prepared.visible as boolean,
              enabled: prepared.enabled as boolean,
              occluded: prepared.occluded as boolean,
            };
          },
          async clear(action) {
            await chrome.tabs.sendMessage(action.tabId, {
              kind: "CLEAR_BOUNDED_CDP_TARGET",
              run_id: action.runId,
              action_id: action.actionId,
              tab_id: action.tabId,
              frame_id: action.frameId,
              document_id: action.documentId,
              document_epoch: action.documentEpoch,
              ref_id: action.refId,
              action_token: action.actionToken,
            });
          },
        },
        (_capability, _origin, runId) => dependencies.authorized(runId),
      )
    : undefined;
  return { boundedCdp };
};
