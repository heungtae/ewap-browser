import { vi } from "vitest";
import { defaultApprovalPolicy } from "../../../src/policy/approval-policy.js";
import { json, nativeResponse } from "../providers/s25-support.js";
import type { DecisionTask } from "../../../src/providers/jev-types.js";
import type { RequestContext } from "../../../src/service-worker/request-context.js";
export const context = (): RequestContext => ({
  requestId: "request-abcdefghijklmnop",
  generation: 1,
  documentEpoch: "epoch-abcdefghijklmnop",
  tabId: 1,
  signal: new AbortController().signal,
  check() {},
});
export const preferences = (mode: "full" | "custom" = "full") => ({
  permission_mode: "standard" as const,
  default_read_scope: "all_dom" as const,
  screenshot_policy: "manual_or_model" as const,
  group_tools_in_timeline: true,
  show_tool_debug_details: false,
  approval_policy: {
    ...defaultApprovalPolicy(),
    mode,
    categories: {
      ...defaultApprovalPolicy().categories,
      source_disclosure:
        mode === "custom" ? ("deny" as const) : ("auto" as const),
    },
  },
});
export const finiteFetcher = (verdict: string, after?: () => void) =>
  vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const input = JSON.parse(String(init?.body)) as {
      questions: DecisionTask["questions"];
    };
    const response = nativeResponse(input.questions, {
      processor: "JEV_DECISION",
      verdict,
    });
    after?.();
    return json(response);
  });
