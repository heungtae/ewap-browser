import { describe, expect, it, vi } from "vitest";
import {
  observeApprovalMode,
  type PreferenceChanges,
} from "../../../src/sidepanel/approval-mode-sync.js";
import { defaultApprovalPolicy } from "../../../src/policy/approval-policy.js";

describe("approval mode synchronization", () => {
  it("updates an open panel when settings are saved and ignores stale startup data", async () => {
    let listener!: Parameters<PreferenceChanges["addListener"]>[0];
    let complete!: (value: unknown) => void;
    const load = new Promise<unknown>((resolve) => {
      complete = resolve;
    });
    const apply = vi.fn();
    observeApprovalMode(
      () => load,
      {
        addListener: (value) => {
          listener = value;
        },
      },
      apply,
    );
    const policy = { ...defaultApprovalPolicy(), mode: "full" };
    listener(
      { agent_preferences: { newValue: { approval_policy: policy } } },
      "sync",
    );
    expect(apply).not.toHaveBeenCalled();
    listener(
      { agent_preferences: { newValue: { approval_policy: policy } } },
      "local",
    );
    expect(apply).toHaveBeenLastCalledWith("full");
    complete({
      preferences: { approval_policy: { ...policy, mode: "custom" } },
    });
    await load;
    expect(apply).toHaveBeenCalledTimes(1);
    listener(
      {
        agent_preferences: {
          newValue: { approval_policy: { ...policy, mode: "custom" } },
        },
      },
      "local",
    );
    expect(apply).toHaveBeenLastCalledWith("custom");
    listener(
      { agent_preferences: { newValue: { approval_policy: {} } } },
      "local",
    );
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it("reads current policy on startup and supports legacy settings", async () => {
    const apply = vi.fn();
    observeApprovalMode(
      async () => ({
        preferences: {
          approval_policy: { ...defaultApprovalPolicy(), mode: "full" },
        },
      }),
      undefined,
      apply,
    );
    await Promise.resolve();
    expect(apply).toHaveBeenLastCalledWith("full");
    observeApprovalMode(
      async () => ({ preferences: { permission_mode: "standard" } }),
      undefined,
      apply,
    );
    await Promise.resolve();
    expect(apply).toHaveBeenLastCalledWith("standard");
  });
});
