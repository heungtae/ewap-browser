import { BoundedCdpAdapter } from "../cdp/bounded-adapter.js";
import type { SessionMarker } from "../cdp/bounded-adapter.js";
import { fail } from "../security/validation.js";
import type { BrowserChromeApi } from "./browser-api.js";

type Dependencies = {
  chrome: BrowserChromeApi | undefined;
  authorized(runId: string): boolean;
};

export const createBoundedCdpRuntime = (dependencies: Dependencies) => {
  const chrome = dependencies.chrome;
  const markerKey = (tabId: number) => `contextpilot_cdp_marker_${tabId}`;
  const markerStore = {
    async set(marker: SessionMarker): Promise<void> {
      await chrome?.storage.session.set?.({
        [markerKey(marker.tabId)]: marker,
      });
    },
    async clear(tabId: number): Promise<void> {
      await chrome?.storage.session.set?.({ [markerKey(tabId)]: null });
    },
    async list(): Promise<SessionMarker[]> {
      const stored = await chrome?.storage.session.get?.(null);
      return Object.entries(stored ?? {}).flatMap(([key, value]) => {
        if (!key.startsWith("contextpilot_cdp_marker_")) return [];
        if (typeof value !== "object" || value === null) return [];
        const marker = value as Partial<SessionMarker>;
        return Number.isInteger(marker.tabId) &&
          marker.tabId! >= 0 &&
          typeof marker.runId === "string" &&
          typeof marker.actionId === "string" &&
          (marker.phase === "attaching" || marker.phase === "attached") &&
          key === markerKey(marker.tabId!)
          ? [marker as SessionMarker]
          : [];
      });
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
              return fail(
                (result as { code?: unknown })?.code === "TARGET_STALE"
                  ? "TARGET_STALE"
                  : "TARGET_NOT_ACTIONABLE",
              );
            const prepared = result as Record<string, unknown>;
            const fields = [
              "unique",
              "sensitive",
              "stale",
              "visible",
              "enabled",
              "occluded",
              "editable",
              "viewportWidth",
              "viewportHeight",
            ];
            if (
              !fields
                .slice(0, 7)
                .every((field) => typeof prepared[field] === "boolean") ||
              !fields
                .slice(7)
                .every((field) => typeof prepared[field] === "number")
            )
              return fail("TARGET_NOT_ACTIONABLE");
            return {
              unique: prepared.unique as boolean,
              sensitive: prepared.sensitive as boolean,
              stale: prepared.stale as boolean,
              visible: prepared.visible as boolean,
              enabled: prepared.enabled as boolean,
              occluded: prepared.occluded as boolean,
              editable: prepared.editable as boolean,
              viewportWidth: prepared.viewportWidth as number,
              viewportHeight: prepared.viewportHeight as number,
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
  boundedCdp?.startRecovery();
  chrome?.debugger?.onDetach?.addListener((target) => {
    if (Number.isInteger(target.tabId)) boundedCdp?.onDetach(target.tabId);
  });
  return { boundedCdp };
};
