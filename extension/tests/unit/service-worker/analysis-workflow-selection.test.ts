import { describe, expect, it, vi } from "vitest";
import {
  serialiseWorkflowSelection,
  persistedWorkflowSelection,
  type WorkflowSelection,
} from "../../../src/service-worker/workflow-selection-codec.js";
import { createWorkflowSessionActions } from "../../../src/service-worker/workflow-session-actions.js";
import type { ActSession } from "../../../src/service-worker/act-session-types.js";

const selection = (): WorkflowSelection => ({
  id: "selection",
  expiresAt: Date.now() + 60000,
  tabId: 9,
  origin: "https://fixture.invalid",
  path: "/report",
  documentEpoch: "doc",
  prompt: "Analyze data and save",
  profile: { id: "fixture", version: 1 },
  profileDefinitions: [],
  candidates: new Map(),
  analysisScope: {
    document_epoch: "doc",
    page_scope_epoch: "scope",
    origin: "https://fixture.invalid",
    path: "/report",
  },
  analysisData: {
    source: { kind: "page_api_read", label: "reviewed page summary" },
    coverage: "complete",
    collected_count: 1,
    records: [{ index: 0, cells: ["PRIVATE_ANALYSIS_ROW"] }],
    truncated: false,
  },
  requestContext: {
    tabId: 9,
    requestId: "request",
    signal: new AbortController().signal,
    check: () => undefined,
  },
});
describe("analysis workflow handoff", () => {
  it("persists only a non-resumable marker, never analysis rows or binding", () => {
    const value = selection();
    const encoded = serialiseWorkflowSelection(value);
    expect(encoded).toHaveProperty("requires_analysis", true);
    for (const field of [
      "PRIVATE_ANALYSIS_ROW",
      "analysisScope",
      "page_scope_epoch",
      "requestContext",
      "records",
    ])
      expect(JSON.stringify(encoded)).not.toContain(field);
    expect(() => persistedWorkflowSelection(encoded)).toThrow(
      "INVALID_ARGUMENT",
    );
  });
  it("carries request-local analysis and scope into a selected workflow", async () => {
    const current = selection();
    const sessions = new Map<string, ActSession>();
    const runStep = vi.fn(async () => ({ ok: true }));
    const persist = vi.fn(async () => undefined);
    const actions = createWorkflowSessionActions({
      selections: new Map([[current.id, current]]),
      sessions,
      persist,
      createId: () => "session",
      runStep,
      safeFailure: (code) => ({ ok: false, code }),
    });
    const respond = vi.fn();
    await actions.start(
      current,
      {
        declaration: {
          schema_version: 1,
          id: "save",
          title: "Save",
          steps: [
            {
              id: "save",
              tool: "click_by_ref",
              target: { role: "button", name: "Save report" },
            },
          ],
        },
      },
      respond,
    );
    await vi.waitFor(() => expect(runStep).toHaveBeenCalledOnce());
    const session = sessions.get("session");
    expect(session?.analysisData).toBe(current.analysisData);
    expect(session?.analysisScope).toBe(current.analysisScope);
    expect(session?.requestContext).toBe(current.requestContext);
    expect(persist).toHaveBeenCalledOnce();
  });
});
