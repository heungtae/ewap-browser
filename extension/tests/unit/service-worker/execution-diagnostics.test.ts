import { describe, expect, it, vi } from "vitest";
import { ExecutionDiagnostics } from "../../../src/service-worker/execution-diagnostics.js";
import { ChatRequestLifecycle } from "../../../src/service-worker/chat-request-lifecycle.js";

describe("execution diagnostics", () => {
  it("records only structured lifecycle data and emits it to Console in trace mode", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const diagnostics = new ExecutionDiagnostics();
    diagnostics.setLevel("trace");
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
          message: "Processed request.accepted at stage ACCEPTED",
        }),
        expect.objectContaining({
          event: "stage.started",
          stage: "CONTACTING_PROVIDER",
          component: "provider",
          message: "Processed stage.started at stage CONTACTING_PROVIDER",
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

  it("keeps ordinary successful execution out of the default error log", () => {
    const diagnostics = new ExecutionDiagnostics();
    diagnostics.accept("request-abcdefghijklmnop", 7, Date.now());
    diagnostics.stage(
      "request-abcdefghijklmnop",
      "provider",
      "CONTACTING_PROVIDER",
    );
    diagnostics.terminal("request-abcdefghijklmnop", "VERIFIED");

    expect(
      diagnostics.list("request-abcdefghijklmnop", 7, 0, 100)?.records,
    ).toEqual([]);

    diagnostics.accept("request-second-abcdefghijk", 7, Date.now());
    diagnostics.terminal(
      "request-second-abcdefghijk",
      "FAILED",
      "REQUEST_TIMEOUT",
    );
    expect(
      diagnostics.list("request-second-abcdefghijk", 7, 0, 100)?.records,
    ).toEqual([
      expect.objectContaining({
        event: "request.terminal",
        level: "error",
        code: "REQUEST_TIMEOUT",
        reason: "request_settled",
      }),
    ]);
  });

  it("retains the explicit stop source in development trace", () => {
    const diagnostics = new ExecutionDiagnostics();
    diagnostics.setLevel("trace");
    diagnostics.accept("request-abcdefghijklmnop", 7, Date.now());
    diagnostics.cancelRequested("request-abcdefghijklmnop");
    diagnostics.terminal(
      "request-abcdefghijklmnop",
      "CANCELLED",
      undefined,
      "panel_stop",
    );

    expect(
      diagnostics.list("request-abcdefghijklmnop", 7, 0, 100)?.records,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "request.cancel_requested",
          reason: "panel_stop",
        }),
        expect.objectContaining({
          event: "request.terminal",
          outcome: "CANCELLED",
          reason: "panel_stop",
        }),
      ]),
    );

    diagnostics.setLevel("error");
    expect(
      diagnostics.list("request-abcdefghijklmnop", 7, 0, 100)?.records,
    ).toEqual([]);
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
