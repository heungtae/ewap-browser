import { waitFor } from "./chrome-cdp-utils.mjs";

export const checkS5UiViewport = async ({ cdp, run, emit, event }) => {
  const sixth = "run-sixth-abcdefghijk";
  await emit(
    event(
      23,
      "run_started",
      { mode: "ask", permission_mode: "standard" },
      sixth,
    ),
  );
  const rows = Array.from({ length: 1_100 }, (_, index) =>
    event(24 + index, "user_message", { text: `row-${index}` }, sixth),
  );
  await run(
    `for(const row of ${JSON.stringify(rows.slice(0, 1_000))}) window.__s5.emit(row)`,
  );
  await run("new Promise(resolve=>requestAnimationFrame(resolve))");
  await run(
    "(() => {const scroller=document.querySelector('#chat-scroll');scroller.scrollTop=scroller.scrollHeight/2;scroller.dispatchEvent(new Event('scroll'));window.__s5.anchor=document.querySelector('#chat-messages').children[800];window.__s5.anchorTop=window.__s5.anchor.getBoundingClientRect().top;return true})()",
  );
  await run(
    `for(const row of ${JSON.stringify(rows.slice(1_000))}) window.__s5.emit(row)`,
  );
  await run("new Promise(resolve=>requestAnimationFrame(resolve))");
  const viewport = await run(
    "({count:document.querySelector('#chat-messages').children.length,connected:window.__s5.anchor.isConnected,drift:window.__s5.anchor.getBoundingClientRect().top-window.__s5.anchorTop})",
  );
  if (
    viewport.count !== 1_000 ||
    !viewport.connected ||
    Math.abs(viewport.drift) > 2
  )
    throw new Error(`S5_TRANSCRIPT_ANCHOR_${JSON.stringify(viewport)}`);
  await emit(event(1_124, "run_terminal", { outcome: "VERIFIED" }, sixth));
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 320,
    height: 640,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const layout = await run(
    "({width:document.documentElement.scrollWidth,client:document.documentElement.clientWidth,send:document.querySelector('#chat-send')?.getAttribute('aria-label')})",
  );
  if (layout.width > layout.client || !layout.send)
    throw new Error(`S5_320PX_OVERFLOW_${JSON.stringify(layout)}`);
  await run("document.querySelector('#new-chat-open').click()");
  if (
    !(await run(
      "document.querySelector('#new-chat-dialog').open && document.querySelector('#new-chat-dialog').contains(document.activeElement)",
    ))
  )
    throw new Error("S5_DIALOG_FOCUS_FAILED");
  await cdp("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await cdp("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await waitFor(
    () => run("!document.querySelector('#new-chat-dialog').open"),
    2_000,
    "S5_DIALOG_ESCAPE_FAILED",
  );
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 320,
    height: 640,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  const zoom = await run(
    "({width:document.documentElement.scrollWidth,client:document.documentElement.clientWidth})",
  );
  if (zoom.width > zoom.client)
    throw new Error(`S5_200_PERCENT_OVERFLOW_${JSON.stringify(zoom)}`);
};
