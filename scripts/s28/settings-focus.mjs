import assert from "node:assert/strict";
import { cdp, evaluate } from "../chrome-cdp-utils.mjs";
export async function tabFrom(target, selector, expected) {
  await evaluate(
    target,
    `document.querySelector(${JSON.stringify(selector)}).focus();true`,
  );
  for (const type of ["keyDown", "keyUp"])
    await cdp(target.webSocketDebuggerUrl, "Input.dispatchKeyEvent", {
      type,
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
    });
  assert.equal(
    await evaluate(
      target,
      `document.activeElement===document.querySelector(${JSON.stringify(expected)})`,
    ),
    true,
    "SETTINGS_TAB_ORDER",
  );
}
