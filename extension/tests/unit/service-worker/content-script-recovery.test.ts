import { describe, expect, it } from "vitest";
import { ContentScriptRecovery } from "../../../src/service-worker/content-script-recovery.js";

describe("content script recovery", () => {
  it("injects the bundled content script only after the optional permission is granted", async () => {
    const calls: unknown[] = [];
    const recovery = new ContentScriptRecovery(
      { contains: async () => true },
      {
        executeScript: async (injection) => {
          calls.push(injection);
        },
      },
    );

    await expect(recovery.recover(42)).resolves.toBe(true);
    expect(calls).toEqual([
      { target: { tabId: 42 }, files: ["js/content.js"] },
    ]);
  });

  it("does not inject when permission is not granted and coalesces concurrent recovery", async () => {
    const denied = new ContentScriptRecovery(
      { contains: async () => false },
      { executeScript: async () => undefined },
    );
    await expect(denied.recover(42)).resolves.toBe(false);

    let resolveInjection: (() => void) | undefined;
    let markInjectionStarted: (() => void) | undefined;
    const injectionStarted = new Promise<void>((resolve) => {
      markInjectionStarted = resolve;
    });
    let injections = 0;
    const coalesced = new ContentScriptRecovery(
      { contains: async () => true },
      {
        executeScript: async () => {
          injections += 1;
          markInjectionStarted?.();
          await new Promise<void>((resolve) => {
            resolveInjection = resolve;
          });
        },
      },
    );
    const first = coalesced.recover(7);
    const second = coalesced.recover(7);
    expect(first).toBe(second);
    await injectionStarted;
    resolveInjection?.();
    await expect(first).resolves.toBe(true);
    expect(injections).toBe(1);
  });
});
