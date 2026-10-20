import { expect, it } from "vitest";
import { setup } from "../../../fixture/s30/setup.js";
import { authenticateUiSender } from "../../../../../apps/chrome-extension/src/runtime/ui-sender.js";
it("S30 derives UI authority from exact live Chrome context metadata", async () => {
  const f = await setup();
  const sender = {
    id: "fixture",
    url: "chrome-extension://fixture/sidepanel/index.html",
    documentId: "ui",
  };
  const port = {
    extensionId: "fixture",
    profileId: "profile",
    async getContexts() {
      return [
        {
          contextType: "SIDE_PANEL",
          documentId: "ui",
          documentUrl: sender.url,
          windowId: 1,
        },
      ];
    },
  };
  const principal = await authenticateUiSender(f.ui, port, sender);
  expect(() => f.ui.assert(principal, "profile", 1)).not.toThrow();
  await expect(
    authenticateUiSender(f.ui, port, { ...sender, documentId: "stale" }),
  ).rejects.toThrow("UI_SENDER_DENIED");
  await expect(
    authenticateUiSender(
      f.ui,
      {
        ...port,
        async getContexts() {
          return [];
        },
      },
      sender,
    ),
  ).rejects.toThrow("UI_SENDER_DENIED");
  expect(() => f.ui.assert(principal, "other", 1)).toThrow(
    "UI_AUTHORITY_DENIED",
  );
});
