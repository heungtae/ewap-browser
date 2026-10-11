import type { ChatEventPayload } from "../contracts/chat-events.js";
import { approvalDecision, createApprovalGrant } from "./approval-runtime.js";
import type { ApprovalCategory } from "../policy/approval-policy.js";
import type { AgentPreferences } from "../policy/permission-mode.js";
import { opaqueId } from "../security/canonical.js";

type Pending = {
  runId: string;
  current(): boolean;
  finish(allowed: boolean): void;
};
const pending = new Map<string, Pending>();
export const requestSourceConsent = (opts: {
  runId: string;
  category?: ApprovalCategory;
  preferences?: AgentPreferences;
  signal?: AbortSignal;
  current(): boolean;
  record?(
    event: Extract<ChatEventPayload, { type: "approval_decision" }>,
  ): void;
  publish(requestId: string): void;
}): Promise<boolean> =>
  new Promise((resolve) => {
    if (opts.signal?.aborted || !opts.current()) {
      resolve(false);
      return;
    }
    const category = opts.category ?? "source_disclosure";
    const decision = approvalDecision(category, opts.preferences);
    if (decision === "deny") {
      resolve(false);
      return;
    }
    if (decision === "auto") {
      createApprovalGrant({
        ...(opts.record ? { record: opts.record } : {}),
        category,
        source: "policy",
        binding: opts.runId,
        current: opts.current,
        ...(opts.preferences ? { preferences: opts.preferences } : {}),
      })();
      resolve(true);
      return;
    }
    const id = opaqueId();
    const finish = (allowed: boolean) => {
      pending.delete(id);
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", abort);
      const accepted = allowed && !opts.signal?.aborted && opts.current();
      if (accepted) {
        try {
          createApprovalGrant({
            ...(opts.record ? { record: opts.record } : {}),
            category,
            source: "user",
            binding: opts.runId,
            current: opts.current,
            ...(opts.preferences ? { preferences: opts.preferences } : {}),
          })();
        } catch {
          resolve(false);
          return;
        }
      }
      resolve(accepted);
    };
    const abort = () => finish(false);
    const timer = setTimeout(abort, 120_000);
    pending.set(id, { runId: opts.runId, current: opts.current, finish });
    opts.signal?.addEventListener("abort", abort, { once: true });
    try {
      opts.publish(id);
    } catch {
      finish(false);
    }
  });
export const decideSourceConsent = (
  requestId: string,
  runId: string,
  allowed: boolean,
): boolean => {
  const item = pending.get(requestId);
  if (!item || item.runId !== runId) return false;
  const current = item.current();
  item.finish(allowed && current);
  return current;
};
