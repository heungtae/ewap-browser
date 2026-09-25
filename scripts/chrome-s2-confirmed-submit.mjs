import { evaluate } from "./chrome-cdp-utils.mjs";

const send = (panel, payload) =>
  evaluate(panel, `chrome.runtime.sendMessage(${JSON.stringify(payload)})`);

export const checkS2ConfirmedSubmit = async ({
  panel,
  page,
  tabId,
  refId,
  attached,
}) => {
  const pending = await send(panel, {
    kind: "START_ACT",
    tool: "click_by_ref",
    ref_id: refId,
  });
  if (pending?.state !== "AWAITING_CONFIRMATION")
    throw new Error(`R2_CDP_GATE: ${pending?.code}`);
  if (await attached(panel, tabId)) throw new Error("R2_CDP_PRECONFIRM_ATTACH");
  const before = await evaluate(
    page,
    "document.querySelector('#submit-confirmed').dataset.trusted ?? ''",
  );
  if (before !== "") throw new Error("R2_CDP_PRECONFIRM_DISPATCH");
  const result = await send(panel, {
    kind: "CONFIRM",
    run_id: pending.run_id,
    confirmation_id: pending.confirmation_id,
    confirmation_nonce: pending.confirmation_nonce,
  });
  if (result?.ok !== true || result.outcome !== "VERIFIED")
    throw new Error(`R2_CDP_CONFIRM: ${JSON.stringify(result)}`);
  const after = await evaluate(
    page,
    "document.querySelector('#submit-confirmed').dataset.trusted",
  );
  if (after !== "yes" || (await attached(panel, tabId)))
    throw new Error("R2_CDP_NOT_VERIFIED_OR_DETACHED");
};
