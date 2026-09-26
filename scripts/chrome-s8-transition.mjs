import { cdp, evaluate, waitFor } from "./chrome-cdp-utils.mjs";
import { setS8Mode } from "./chrome-s8-settings.mjs";

const submit = (panel) =>
  evaluate(
    panel,
    "(() => {document.querySelector('#chat-input').value='Archive case';document.querySelector('#chat-form').requestSubmit();return true})()",
  );
const count = (panel, kind) =>
  evaluate(
    panel,
    `document.querySelectorAll('.event-card[data-kind="${kind}"]').length`,
  );
const click = (panel, kind, label) =>
  evaluate(
    panel,
    `(() => {const card=[...document.querySelectorAll('.event-card[data-kind="${kind}"]')].at(-1);const button=[...card.querySelectorAll('button')].find(item=>item.textContent===${JSON.stringify(label)});button.click();return true})()`,
  );

export const checkS8Transition = async ({
  panel,
  page,
  fixtureData,
  cdpPort,
  version,
  extensionId,
  fixtureTarget,
}) => {
  await setS8Mode({
    cdpPort,
    version,
    extensionId,
    fixtureTarget,
    mode: "standard",
  });
  await cdp(page.webSocketDebuggerUrl, "Page.reload");
  await waitFor(
    () =>
      evaluate(page, "document.querySelector('#target')?.disabled === false"),
    10_000,
    "S8_STANDARD_RELOAD_FAILED",
  );
  await submit(panel);
  try {
    await waitFor(
      () =>
        count(panel, "review").then(
          (value) => value >= 1 && fixtureData.providerRequests.length >= 5,
        ),
      12_000,
      "S8_STANDARD_REVIEW_MISSING",
    );
  } catch (error) {
    const ui = await evaluate(
      panel,
      "({send:document.querySelector('#chat-send')?.dataset.state,cards:[...document.querySelectorAll('.event-card')].map(card=>({kind:card.dataset.kind,title:card.querySelector('b')?.textContent})).slice(-5)})",
    );
    throw new Error(
      `${error.message}: ${JSON.stringify({ ui, calls: fixtureData.providerRequests.length })}`,
    );
  }
  await click(panel, "review", "이번 단계 실행");
  await waitFor(
    () => count(panel, "permission").then((value) => value === 1),
    10_000,
    "S8_STANDARD_PERMISSION_MISSING",
  );
  if (
    (await evaluate(
      page,
      "document.querySelector('#target').dataset.trusted ?? ''",
    )) !== ""
  )
    throw new Error("S8_STANDARD_EXECUTED_BEFORE_PERMISSION");
  await click(panel, "permission", "거부");
  await waitFor(
    () =>
      evaluate(
        panel,
        "document.querySelector('#chat-send')?.dataset.state === 'send'",
      ),
    10_000,
    "S8_DENIAL_NOT_SETTLED",
  );
  await setS8Mode({
    cdpPort,
    version,
    extensionId,
    fixtureTarget,
    mode: "skip_all_permission_checks",
  });
  const permissionBeforeSkip = await count(panel, "permission");
  await submit(panel);
  await waitFor(
    () =>
      count(panel, "review").then(
        (value) => value >= 1 && fixtureData.providerRequests.length >= 7,
      ),
    12_000,
    "S8_DENIED_REVIEW_MISSING",
  );
  await click(panel, "review", "이번 단계 실행");
  await waitFor(
    () => count(panel, "error").then((value) => value >= 1),
    10_000,
    "S8_STORED_DENY_BYPASSED",
  );
  const state = await evaluate(
    page,
    "({trusted:document.querySelector('#target').dataset.trusted ?? '',disabled:document.querySelector('#target').disabled})",
  );
  const requests = fixtureData.providerRequests.length;
  if (
    state.trusted ||
    state.disabled ||
    requests !== 7 ||
    (await count(panel, "permission")) !== permissionBeforeSkip
  )
    throw new Error(
      `S8_STORED_DENY_BOUNDARY: ${JSON.stringify({ state, requests })}`,
    );
  return { providerCalls: requests };
};
