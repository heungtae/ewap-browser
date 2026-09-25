import { evaluate } from "./chrome-cdp-utils.mjs";

const send = (panel, payload) =>
  evaluate(panel, `chrome.runtime.sendMessage(${JSON.stringify(payload)})`);
const typeStart = (panel, refId, permissionRequestId) =>
  send(panel, {
    kind: "START_ACT",
    tool: "set_text_by_ref",
    ref_id: refId,
    ...(permissionRequestId && { permission_request_id: permissionRequestId }),
  });
const decide = (panel, request, decision) =>
  send(panel, {
    kind: "PERMISSION_DECISION",
    permission_request_id: request.permission_request_id,
    decision,
  });
const expectState = (value, state, stage) => {
  if (value?.state !== state) throw new Error(`${stage}: ${value?.code}`);
};

export const checkS2Inputs = async ({
  panel,
  page,
  tabId,
  keyRef,
  textRef,
  attached,
}) => {
  const keyed = await send(panel, {
    kind: "START_ACT",
    tool: "press_key_by_ref",
    ref_id: keyRef,
    argument: { key: "Enter" },
  });
  if (keyed?.outcome !== "VERIFIED")
    throw new Error(`TRUSTED_KEY: ${keyed?.code}`);
  if (
    (await evaluate(
      page,
      "document.querySelector('#key-target').dataset.trustedKey",
    )) !== "yes"
  )
    throw new Error("SYNTHETIC_KEY_ACCEPTED");
  if (await attached(panel, tabId)) throw new Error("KEY_DETACH_LEAK");

  const typeRequest = await typeStart(panel, textRef);
  expectState(typeRequest, "PERMISSION_REQUIRED", "TYPE_GATE");
  if ((await decide(panel, typeRequest, "once"))?.ok !== true)
    throw new Error("TYPE_ONCE_FAILED");
  const awaitingText = await typeStart(
    panel,
    textRef,
    typeRequest.permission_request_id,
  );
  expectState(awaitingText, "AWAITING_VALUE", "TYPE_VALUE_GATE");
  const typed = await send(panel, {
    kind: "SUBMIT_ACTION_VALUE",
    run_id: awaitingText.run_id,
    value_slot_id: awaitingText.value_slot_id,
    value_kind: awaitingText.value_kind,
    value: "S2 trusted input",
  });
  if (typed?.outcome !== "VERIFIED")
    throw new Error(`TRUSTED_TEXT: ${typed?.code}`);
  const textState = await evaluate(
    page,
    "({value:document.querySelector('#case-name').value,trusted:document.querySelector('#case-name').dataset.trustedText})",
  );
  if (textState?.value !== "S2 trusted input" || textState.trusted !== "yes")
    throw new Error("SYNTHETIC_TEXT_ACCEPTED");
  if (await attached(panel, tabId)) throw new Error("TEXT_DETACH_LEAK");

  const sensitiveRequest = await typeStart(panel, textRef);
  expectState(sensitiveRequest, "PERMISSION_REQUIRED", "SENSITIVE_GATE");
  if ((await decide(panel, sensitiveRequest, "once"))?.ok !== true)
    throw new Error("SENSITIVE_ONCE_FAILED");
  const sensitive = await typeStart(
    panel,
    "unprojected-credential-ref",
    sensitiveRequest.permission_request_id,
  );
  if (sensitive?.code !== "TARGET_NOT_ACTIONABLE")
    throw new Error(`SENSITIVE_REF_ACCEPTED: ${sensitive?.code}`);
  const denyRequest = await typeStart(panel, textRef);
  expectState(denyRequest, "PERMISSION_REQUIRED", "TYPE_DENY_GATE");
  if ((await decide(panel, denyRequest, "deny"))?.ok !== true)
    throw new Error("DENY_DECISION_FAILED");
  if ((await typeStart(panel, textRef))?.code !== "POLICY_DENIED")
    throw new Error("STORED_DENY_BYPASSED");
  if (await attached(panel, tabId)) throw new Error("DENIED_ATTACH");
};
