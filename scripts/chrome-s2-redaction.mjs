import { evaluate } from "./chrome-cdp-utils.mjs";

export const checkS2Redaction = async ({ panel, panelWindowId, page }) => {
  const remaining = await evaluate(
    page,
    "document.querySelectorAll('[data-contextpilot-action-token]').length",
  );
  if (remaining !== 0) throw new Error("S2_ACTION_TOKEN_LEFT_ON_PAGE");
  const stored = await evaluate(
    panel,
    "Promise.all([chrome.storage.local.get(null),chrome.storage.session.get(null)])",
  );
  const diagnostics = await evaluate(
    panel,
    `chrome.runtime.sendMessage(${JSON.stringify({
      kind: "PANEL_REQUEST",
      window_id: panelWindowId,
      payload: { schema_version: 1, kind: "DIAGNOSTICS_BUNDLE_EXPORT" },
    })})`,
  );
  if (diagnostics?.ok !== true || !diagnostics.data?.sections)
    throw new Error("S2_DIAGNOSTICS_UNAVAILABLE");
  const output = JSON.stringify([stored, diagnostics.data]);
  for (const secret of [
    "S2_SECRET_PASSWORD",
    "S2_SECRET_OTP",
    "S2_SECRET_TOKEN",
    "S2_SECRET_RECOVERY",
    "S2 trusted input",
    "data-contextpilot-action-token",
    "#save-a",
  ])
    if (output.includes(secret)) throw new Error("S2_CDP_DATA_RETAINED");
};
