import type { ChatEventPayload } from "../contracts/chat-events.js";
import type { AgentPreferences } from "../policy/permission-mode.js";
import { allowsModelScreenshot } from "../policy/permission-mode.js";
import { isPlainObject } from "../security/validation.js";
import type { BrowserTabs } from "./browser-api.js";
import type { ActivePage } from "./page-context-runtime.js";
import { assertRequestActive, type RequestContext } from "./request-context.js";
import { requestSourceConsent } from "./source-consent.js";
export const createAskVisionConsent = (opts: {
  active: ActivePage;
  runId: string;
  context?: RequestContext;
  tabs: BrowserTabs;
  preferences(): AgentPreferences;
  current(): boolean;
  readActive(scope?: undefined, tabId?: number): Promise<ActivePage>;
  publish(runId: string, event: ChatEventPayload): void;
}) => {
  const current = () =>
    !opts.context?.signal.aborted &&
    opts.current() &&
    allowsModelScreenshot(opts.preferences().screenshot_policy);
  const safe = async () => {
    if (!current()) return false;
    const fresh = await opts.readActive(undefined, opts.active.tabId);
    assertRequestActive(opts.context);
    if (
      fresh.origin !== opts.active.origin ||
      fresh.path !== opts.active.path ||
      fresh.snapshot.document_epoch !== opts.active.snapshot.document_epoch
    )
      return false;
    const result = await opts.tabs.sendMessage(opts.active.tabId, {
      kind: "CONTENT_COMPONENT_VISION_CHECK",
      document_epoch: opts.active.snapshot.document_epoch,
    });
    return (
      current() &&
      isPlainObject(result) &&
      result.safe === true &&
      result.document_epoch === opts.active.snapshot.document_epoch
    );
  };
  return {
    current,
    safe,
    consent: async () => {
      if (!(await safe())) return false;
      const accepted = await requestSourceConsent({
        runId: opts.runId,
        category: "vision_disclosure",
        preferences: opts.preferences(),
        current,
        ...(opts.context?.signal ? { signal: opts.context.signal } : {}),
        record: (event) => opts.publish(opts.runId, event),
        publish: (requestId) =>
          opts.publish(opts.runId, {
            type: "source_consent_required",
            request_id: requestId,
            resource_count: 1,
            purpose: "component-vision",
            host: new URL(opts.active.origin).host,
          }),
      });
      return accepted && (await safe());
    },
  };
};
