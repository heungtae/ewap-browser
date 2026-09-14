import { expect, it, vi } from "vitest";
import { createRuntimeMessageRouter } from "../../../src/service-worker/runtime-message-router.js";

const setup = () => {
  const handle = vi.fn(() => ({ handled: true }));
  const route = createRuntimeMessageRouter({
    isPanelSender: (sender) => sender.id === "self" && sender.url === "panel",
    storageReady: () => true,
    safeFailure: (code) => ({ ok: false, code }),
    chatRoute: { handle },
    routeDomain: vi.fn(),
  });
  return { route, handle };
};
it("unwraps window context only from the authenticated panel", () => {
  const { route, handle } = setup();
  const payload = { kind: "CHAT_REQUEST_STATUS" };
  const sender = { id: "self", url: "panel", documentId: "doc" };
  const respond = vi.fn();
  route({ kind: "PANEL_REQUEST", window_id: 5, payload }, sender, respond);
  expect(handle).toHaveBeenCalledWith(
    payload,
    { ...sender, panelWindowId: 5 },
    respond,
  );
});
it("rejects a content script attempting to supply a window", () => {
  const { route, handle } = setup();
  const respond = vi.fn();
  route(
    { kind: "PANEL_REQUEST", window_id: 5, payload: {} },
    { id: "self", url: "https://example.test" },
    respond,
  );
  expect(handle).not.toHaveBeenCalled();
  expect(respond).toHaveBeenCalledWith({ ok: false, code: "INVALID_ARGUMENT" });
});
it("rejects invalid window identifiers", () => {
  const { route, handle } = setup();
  for (const window_id of [-1, "5", null, 0.5])
    route(
      { kind: "PANEL_REQUEST", window_id, payload: {} },
      { id: "self", url: "panel" },
      vi.fn(),
    );
  expect(handle).not.toHaveBeenCalled();
});
