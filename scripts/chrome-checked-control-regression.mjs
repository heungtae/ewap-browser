import { evaluate } from "./chrome-cdp-utils.mjs";

export const checkedControlRegression = async ({
  send,
  intent,
  record,
  page,
}) => {
  const execute = (name, checked) =>
    send({
      kind: "CONTENT_EXECUTE_R1",
      intent: intent(name, "set_checked_by_ref", { checked }),
    });
  const success = { ok: true, postcondition: "semantic" };
  const rejected = { ok: false, code: "TARGET_NOT_ACTIONABLE" };
  record(
    "aria-radio-already-selected-no-op",
    await execute("Custom radio", true),
    success,
  );
  record(
    "aria-radio-false-rejected",
    await execute("Custom radio", false),
    rejected,
  );
  record(
    "aria-disabled-execution-rejected",
    await execute("ARIA disabled", true),
    rejected,
  );
  record("aria-no-op-no-extra-click", await evaluate(page, "radioClicks"), 1);
  await evaluate(
    page,
    `(()=>{
    const e=document.querySelector('[aria-label="Custom checkbox"]');
    e.setAttribute('aria-checked','mixed');return true;
  })()`,
  );
  record(
    "aria-mixed-execution-rejected",
    await execute("Custom checkbox", true),
    rejected,
  );
  record(
    "aria-mixed-no-extra-click",
    await evaluate(page, "checkboxClicks"),
    1,
  );
  await evaluate(
    page,
    `(()=>{
    const e=document.querySelector('[aria-label="Custom radio"]');
    e.setAttribute('aria-checked','false');
    e.onclick=()=>{radioClicks++;const next=e.cloneNode(true);next.setAttribute('aria-checked','true');e.replaceWith(next);};
    return true;
  })()`,
  );
  record(
    "replacement-does-not-inherit-execution-authority",
    await execute("Custom radio", true),
    { ok: false, code: "TARGET_STALE" },
  );
  record("replacement-clicked-once", await evaluate(page, "radioClicks"), 2);
};
