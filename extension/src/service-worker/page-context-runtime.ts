import { validateSemanticSnapshot } from "../contracts/semantic-snapshot.js";
import {
  validateWorkflowDeclaration,
  type WorkflowDeclaration,
} from "../contracts/workflow.js";
import type { PageReadScope, SemanticSnapshot } from "../contracts/types.js";
import { digestCanonical } from "../security/canonical.js";
import { ContractError } from "../security/validation.js";
import { semanticFingerprint } from "../profile/fingerprint.js";
import { ProfileResolver, type ResolvedProfile } from "../profile/resolver.js";
import { ProfileReplayStore } from "../profile/profile-replay.js";
import { validateProfileResolverSettings } from "../settings/profile-settings.js";
import type { PageScope } from "../state/tab-chat-session-store.js";
import type { BrowserChromeApi } from "./browser-api.js";
import type { ContentScriptRecovery } from "./content-script-recovery.js";

export type ActivePage = {
  tabId: number;
  origin: string;
  snapshot: SemanticSnapshot;
  path: string;
  workflow?: WorkflowDeclaration;
};

type Dependencies = {
  chrome: BrowserChromeApi | undefined;
  defaultScope(): PageReadScope;
  isRegistered(tabId: number, epoch: string): boolean;
  pageOrigin(url: string | undefined): string;
  recovery: ContentScriptRecovery;
  scopeFor(tabId: number, epoch: string): string | undefined;
};

export const createPageContextRuntime = (dependencies: Dependencies) => {
  const replay = new ProfileReplayStore();
  const read = async (
    scope = dependencies.defaultScope(),
  ): Promise<ActivePage> => {
    const chrome = dependencies.chrome!;
    const tabs = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    const tab = tabs[0];
    const tabId = tab?.id;
    if (!tab || tabId === undefined)
      throw new ContractError("ORIGIN_NOT_ALLOWED");
    let origin = dependencies.pageOrigin(tab.url);
    let result: unknown;
    try {
      result = await chrome.tabs.sendMessage(tabId, {
        kind: "CONTENT_SNAPSHOT",
        scope,
      });
    } catch {
      if (!(await dependencies.recovery.recover(tabId)))
        throw new ContractError("DOCUMENT_NOT_REGISTERED");
      try {
        result = await chrome.tabs.sendMessage(tabId, {
          kind: "CONTENT_SNAPSHOT",
          scope,
        });
      } catch {
        throw new ContractError("DOCUMENT_NOT_REGISTERED");
      }
    }
    if (
      typeof result !== "object" ||
      result === null ||
      !(result as { ok?: unknown }).ok
    ) {
      const code = (result as { code?: unknown } | undefined)?.code;
      throw new ContractError(
        code === "DOCUMENT_NOT_REGISTERED" || code === "PAGE_SCOPE_STALE"
          ? code
          : "DOCUMENT_NOT_REGISTERED",
      );
    }
    const payload = (result as { snapshot?: unknown }).snapshot;
    if (
      typeof payload !== "object" ||
      payload === null ||
      typeof (payload as { origin?: unknown }).origin !== "string"
    )
      throw new ContractError("ORIGIN_NOT_ALLOWED");
    if ((payload as { origin: string }).origin !== origin) {
      const latest = (
        await chrome.tabs.query({ active: true, lastFocusedWindow: true })
      )[0];
      if (latest?.id !== tabId) throw new ContractError("ORIGIN_NOT_ALLOWED");
      origin = dependencies.pageOrigin(latest.url);
      if ((payload as { origin: string }).origin !== origin)
        throw new ContractError("ORIGIN_NOT_ALLOWED");
    }
    const snapshot = validateSemanticSnapshot(
      (payload as { snapshot: unknown }).snapshot,
    );
    let workflow: WorkflowDeclaration | undefined;
    try {
      const declared = (payload as { workflow?: unknown }).workflow;
      if (declared !== undefined)
        workflow = validateWorkflowDeclaration(declared);
    } catch {
      workflow = undefined;
    }
    if (!dependencies.isRegistered(tabId, snapshot.document_epoch))
      throw new ContractError("DOCUMENT_NOT_REGISTERED");
    let path = "/";
    try {
      path = new URL(tab.url ?? origin).pathname;
    } catch {
      throw new ContractError("ORIGIN_NOT_ALLOWED");
    }
    return { tabId, origin, snapshot, path, ...(workflow ? { workflow } : {}) };
  };

  const resolveProfile = async (
    active: ActivePage,
  ): Promise<ResolvedProfile> => {
    const chrome = dependencies.chrome!;
    const stored = await chrome.storage.local.get?.("profile_resolver");
    if (!stored?.profile_resolver)
      throw new ContractError("PROFILE_UNAVAILABLE");
    const settings = validateProfileResolverSettings(stored.profile_resolver);
    const resolver = new ProfileResolver(
      {
        deploymentId: settings.deployment_id,
        url: settings.url,
        allowedOrigins: settings.allowed_origins,
        keyRing: settings.key_ring,
      },
      fetch,
      replay,
    );
    const resolved = await resolver.resolveWithProof({
      origin: active.origin,
      path: active.path,
      pageContextDigest: digestCanonical(active.snapshot),
      fingerprint: semanticFingerprint(active.snapshot).fingerprint,
    });
    return resolved;
  };

  const chatScope = (active: ActivePage): PageScope => ({
    document_epoch: active.snapshot.document_epoch,
    page_scope_epoch:
      dependencies.scopeFor(active.tabId, active.snapshot.document_epoch) ??
      active.snapshot.document_epoch,
    origin: active.origin,
    path: active.path,
  });

  return { chatScope, read, resolveProfile };
};
