import { cdp, evaluate, waitFor } from "./chrome-cdp-utils.mjs";

export const checkS8PlanExpiry = async ({
  panel,
  page,
  fixtureData,
  prompt,
}) => {
  await cdp(page.webSocketDebuggerUrl, "Page.reload");
  await waitFor(
    () =>
      evaluate(page, "document.querySelector('#target')?.disabled === false"),
    10_000,
    "S8_RELOAD_FAILED",
  );
  await evaluate(
    panel,
    `(() => {document.querySelector('#chat-input').value=${prompt};document.querySelector('#chat-form').requestSubmit();return true})()`,
  );
  await waitFor(
    () =>
      evaluate(
        panel,
        "document.querySelectorAll('.event-card[data-kind=review]').length >= 2",
      ),
    12_000,
    "S8_SECOND_REVIEW_MISSING",
  );
  await evaluate(
    panel,
    "[...document.querySelectorAll('.event-card[data-kind=review]')].at(-1).querySelector('button.primary').click()",
  );
  await waitFor(
    () =>
      evaluate(
        panel,
        "document.querySelector('.event-card[data-kind=error]') !== null",
      ),
    10_000,
    "S8_EXPIRED_PLAN_NOT_DENIED",
  );
  const after = await evaluate(
    page,
    "({trusted:document.querySelector('#target').dataset.trusted ?? '',disabled:document.querySelector('#target').disabled})",
  );
  if (
    after.trusted ||
    after.disabled ||
    fixtureData.providerRequests.length !== 5
  )
    throw new Error("S8_PLAN_REUSED_AFTER_SESSION");
};
