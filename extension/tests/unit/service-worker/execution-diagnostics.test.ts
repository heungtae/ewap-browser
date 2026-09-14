import { describe, expect, it, vi } from "vitest";
import { ExecutionDiagnostics } from "../../../src/service-worker/execution-diagnostics.js";
import { ChatRequestLifecycle } from "../../../src/service-worker/chat-request-lifecycle.js";

describe("execution diagnostics", () => {
  it("records only structured lifecycle data and emits it to Console in debug mode", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const diagnostics = new ExecutionDiagnostics();
    diagnostics.setLevel("debug");
    diagnostics.accept("request-abcdefghijklmnop", 7, Date.now());
    diagnostics.stage(
      "request-abcdefghijklmnop",
      "provider",
      "CONTACTING_PROVIDER",
    );
    diagnostics.actForTab(7, "SNAPSHOT_VALIDATED");
    diagnostics.terminal("request-abcdefghijklmnop", "VERIFIED");

    const result = diagnostics.list("request-abcdefghijklmnop", 7, 0, 100);
    expect(result?.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "request.accepted",
          request_id: "request-abcdefghijklmnop",
          component: "panel",
        }),
        expect.objectContaining({
          event: "stage.started",
          stage: "CONTACTING_PROVIDER",
          component: "provider",
        }),
        expect.objectContaining({
          event: "stage.started",
          stage: "SNAPSHOT_VALIDATED",
          component: "act",
        }),
      ]),
    );
    expect(JSON.stringify(result)).not.toContain("prompt");
    expect(info).toHaveBeenCalledWith(
      "[ContextPilot][trace]",
      expect.objectContaining({ schema_version: 1 }),
    );
    info.mockRestore();
  });

  it("does not disclose a request trace across tabs", () => {
    const diagnostics = new ExecutionDiagnostics();
    diagnostics.accept("request-abcdefghijklmnop", 7, Date.now());

    expect(
      diagnostics.list("request-abcdefghijklmnop", 8, 0, 100),
    ).toBeUndefined();
    expect(diagnostics.clear("request-abcdefghijklmnop", 8)).toBe(false);
  });

  it("keeps the status stage aligned with published request progress", () => {
    const requests = new ChatRequestLifecycle();
    requests.start({
      request_id: "request-abcdefghijklmnop",
      tab_id: 7,
      mode: "ask",
      prompt: "not persisted in diagnostics",
    });
    requests.startRun("request-abcdefghijklmnop");
    requests.progress(7, "CONTACTING_PROVIDER");

    expect(requests.status("request-abcdefghijklmnop", 7)).toMatchObject({
      state: "RUNNING",
      stage: "CONTACTING_PROVIDER",
    });
  });
});
