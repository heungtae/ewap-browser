import { evaluate } from "./chrome-cdp-utils.mjs";
import { checkS2Inputs } from "./chrome-s2-inputs.mjs";
import { checkS2ConfirmedSubmit } from "./chrome-s2-confirmed-submit.mjs";

const send = (panel, payload) =>
  evaluate(panel, `chrome.runtime.sendMessage(${JSON.stringify(payload)})`);
const start = (panel, tool, refId, argument) =>
  send(panel, {
    kind: "START_ACT",
    tool,
    ref_id: refId,
    ...(argument && { argument }),
  });
const decide = (panel, request, decision) =>
  send(panel, {
    kind: "PERMISSION_DECISION",
    permission_request_id: request.permission_request_id,
    decision,
  });
const startAfterDecision = (panel, request, tool, refId, argument) =>
  send(panel, {
    kind: "START_ACT",
    tool,
    ref_id: refId,
    ...(argument && { argument }),
    permission_request_id: request.permission_request_id,
  });
const expectState = (value, state, stage) => {
  if (value?.state !== state) throw new Error(`${stage}: ${value?.code}`);
};
const expectVerified = (value, stage) => {
  if (value?.ok !== true || value.outcome !== "VERIFIED")
    throw new Error(`${stage}: ${JSON.stringify(value)}`);
};
const attached = async (panel, tabId) =>
  evaluate(
    panel,
    `chrome.debugger.getTargets().then(items => items.find(item => item.tabId === ${tabId})?.attached === true)`,
  );

export const checkS2Permissions = async ({ panel, page, tabId }) => {
  const preview = await send(panel, { kind: "START_PREVIEW" });
  const nodes = preview?.snapshot?.nodes;
  if (preview?.ok !== true || !Array.isArray(nodes))
    throw new Error("S2_PREVIEW_MISSING");
  for (const marker of [
    "S2_SECRET_PASSWORD",
    "S2_SECRET_OTP",
    "S2_SECRET_TOKEN",
    "S2_SECRET_RECOVERY",
    "S1_SECRET_COOKIE",
  ]) {
    if (JSON.stringify(preview).includes(marker))
      throw new Error("S2_CREDENTIAL_PROJECTION_LEAK");
  }
  if (nodes.some((node) => /password|otp|token|recovery/i.test(node.name)))
    throw new Error("S2_CREDENTIAL_TARGET_PROJECTED");
  const byName = (name) => nodes.find((node) => node.name === name);
  const saves = ["Save A", "Save B", "Save C"].map(byName);
  const keyTarget = byName("Key target");
  const caseName = byName("Case name");
  const submit = byName("Submit with confirmation");
  const confirmations = nodes.filter(
    (node) => node.name === "Require confirmation",
  );
  if (
    saves.some((node) => !node) ||
    !keyTarget ||
    !caseName ||
    !submit ||
    confirmations.length !== 2
  )
    throw new Error("S2_CONTROLS_MISSING");

  for (const tool of ["navigate", "download", "network_write"]) {
    if (
      (await start(panel, tool, saves[0].ref_id))?.code !==
      "PROFILE_UNAVAILABLE"
    )
      throw new Error(`UNDECLARED_CAPABILITY_ACCEPTED: ${tool}`);
  }
  const injected = await send(panel, {
    kind: "START_ACT",
    tool: "click_by_ref",
    ref_id: saves[0].ref_id,
    capability: "network_write",
  });
  if (injected?.code !== "PROFILE_UNAVAILABLE")
    throw new Error("PROVIDER_CAPABILITY_INJECTION_ACCEPTED");

  const noGrant = await start(panel, "click_by_ref", saves[0].ref_id);
  expectState(noGrant, "PERMISSION_REQUIRED", "NO_GRANT");
  if (await attached(panel, tabId)) throw new Error("UNAPPROVED_ATTACH");
  const unchanged = await evaluate(
    page,
    "document.querySelector('#save-a').dataset.trusted ?? ''",
  );
  if (unchanged) throw new Error("UNAPPROVED_DISPATCH");
  if ((await decide(panel, noGrant, "once"))?.ok !== true)
    throw new Error("ONCE_DECISION_FAILED");
  expectVerified(
    await startAfterDecision(panel, noGrant, "click_by_ref", saves[0].ref_id),
    "TRUSTED_CLICK_A",
  );
  if (
    (await evaluate(
      page,
      "document.querySelector('#save-a').dataset.trusted",
    )) !== "yes"
  )
    throw new Error("SYNTHETIC_CLICK_ACCEPTED");
  if (await attached(panel, tabId)) throw new Error("CLICK_DETACH_LEAK");

  const onceExpired = await start(panel, "click_by_ref", saves[1].ref_id);
  expectState(onceExpired, "PERMISSION_REQUIRED", "ONCE_NOT_EXPIRED");
  if ((await decide(panel, onceExpired, "always"))?.ok !== true)
    throw new Error("ALWAYS_DECISION_FAILED");
  expectVerified(
    await startAfterDecision(
      panel,
      onceExpired,
      "click_by_ref",
      saves[1].ref_id,
    ),
    "TRUSTED_CLICK_B",
  );
  expectVerified(
    await start(panel, "click_by_ref", saves[2].ref_id),
    "ALWAYS_GRANT_CLICK_C",
  );
  if (await attached(panel, tabId)) throw new Error("ALWAYS_DETACH_LEAK");

  const firstR2 = await start(
    panel,
    "set_checked_by_ref",
    confirmations[0].ref_id,
    {
      checked: true,
    },
  );
  expectState(firstR2, "AWAITING_CONFIRMATION", "R2_GATE");
  if (await attached(panel, tabId)) throw new Error("R2_PRECONFIRM_ATTACH");
  if ((await send(panel, { kind: "CANCEL" }))?.outcome !== "CANCELLED")
    throw new Error("R2_STOP_FAILED");
  const cancelledConfirm = await send(panel, {
    kind: "CONFIRM",
    run_id: firstR2.run_id,
    confirmation_id: firstR2.confirmation_id,
    confirmation_nonce: firstR2.confirmation_nonce,
  });
  if (cancelledConfirm?.code !== "CONFIRMATION_INVALID")
    throw new Error("R2_STOP_CONFIRM_ACCEPTED");
  const secondR2 = await start(
    panel,
    "set_checked_by_ref",
    confirmations[1].ref_id,
    { checked: true },
  );
  expectState(secondR2, "AWAITING_CONFIRMATION", "R2_SECOND_GATE");
  const confirm = {
    kind: "CONFIRM",
    run_id: secondR2.run_id,
    confirmation_id: secondR2.confirmation_id,
    confirmation_nonce: secondR2.confirmation_nonce,
  };
  expectVerified(await send(panel, confirm), "R2_CONFIRM");
  if ((await send(panel, confirm))?.code !== "CONFIRMATION_INVALID")
    throw new Error("R2_REPLAY_ACCEPTED");

  await checkS2ConfirmedSubmit({
    panel,
    page,
    tabId,
    refId: submit.ref_id,
    attached,
  });

  await checkS2Inputs({
    panel,
    page,
    tabId,
    keyRef: keyTarget.ref_id,
    textRef: caseName.ref_id,
    attached,
  });
  return { preview, attached };
};
