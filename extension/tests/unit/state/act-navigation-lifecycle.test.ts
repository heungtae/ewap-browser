import { describe, expect, it } from "vitest";
import { ActNavigationLifecycle } from "../../../src/state/act-navigation-lifecycle.js";
import type { Run } from "../../../src/state/run-coordinator.js";

const run = (id = "run-a", tabId = 7): Run => ({
  id,
  tabId,
  frameId: 0,
  documentEpoch: "epoch-a",
  mode: "act",
  tabContext: "context-a",
  phase: "EXECUTING",
});

describe("ActNavigationLifecycle", () => {
  it("keeps only the approved run alive while its exact navigation is verified", () => {
    const lifecycle = new ActNavigationLifecycle();
    const approved = run();

    lifecycle.begin(approved, {
      origin: "https://fixture.company.test",
      pathname: "/analysis",
    });

    expect(lifecycle.retains(approved)).toBe(true);
    expect(lifecycle.expected(approved)).toEqual({
      origin: "https://fixture.company.test",
      pathname: "/analysis",
    });
    expect(lifecycle.retains(run("run-b"))).toBe(false);
  });

  it("releases the navigation exception after one terminal outcome", () => {
    const lifecycle = new ActNavigationLifecycle();
    const approved = run();
    lifecycle.begin(approved, {
      origin: "https://fixture.company.test",
      pathname: "/analysis",
    });

    lifecycle.finish(approved);

    expect(lifecycle.retains(approved)).toBe(false);
    expect(lifecycle.expected(approved)).toBeUndefined();
  });

  it("does not preserve a later run that reuses the same tab", () => {
    const lifecycle = new ActNavigationLifecycle();
    const first = run("run-a");
    const later = run("run-b");
    lifecycle.begin(first, {
      origin: "https://fixture.company.test",
      pathname: "/analysis",
    });

    lifecycle.begin(later, {
      origin: "https://fixture.company.test",
      pathname: "/next",
    });

    expect(lifecycle.retains(first)).toBe(false);
    expect(lifecycle.retains(later)).toBe(true);
  });
});
