import { cdp, evaluate, waitFor } from "./chrome-cdp-utils.mjs";

export const setS8Mode = async ({
  cdpPort,
  version,
  extensionId,
  fixtureTarget,
  mode,
}) => {
  const created = await cdp(
    version.webSocketDebuggerUrl,
    "Target.createTarget",
    {
      url: `chrome-extension://${extensionId}/settings/index.html`,
    },
  );
  try {
    const settings = await waitFor(
      async () =>
        (
          await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then(
            (response) => response.json(),
          )
        ).find((item) => item.id === created.targetId),
      10_000,
      "S8_SETTINGS_NOT_READY",
    );
    await waitFor(
      () =>
        evaluate(
          settings,
          "document.querySelector('#agent-preferences-form select[name=permission_mode]') !== null",
        ),
      10_000,
      "S8_SETTINGS_FORM_MISSING",
    );
    if (mode === "skip_all_permission_checks") {
      await evaluate(
        settings,
        "(() => {const form=document.querySelector('#agent-preferences-form');form.elements.namedItem('permission_mode').value='skip_all_permission_checks';form.requestSubmit();return true})()",
      );
      await waitFor(
        () =>
          evaluate(
            settings,
            "document.querySelector('#agent-preferences-status').value.includes('확인 문구')",
          ),
        10_000,
        "S8_ACK_NOT_ENFORCED",
      );
      const unchanged = await evaluate(
        settings,
        "chrome.runtime.sendMessage({kind:'AGENT_PREFERENCES_GET'}).then(item=>item.preferences?.permission_mode)",
      );
      if (unchanged !== "standard") throw new Error("S8_ACK_CHANGED_MODE");
    }
    const selected = JSON.stringify(mode);
    const acknowledgement = JSON.stringify(
      mode === "skip_all_permission_checks" ? "권한 질문 생략" : "",
    );
    await evaluate(
      settings,
      `(() => {const form=document.querySelector('#agent-preferences-form');form.elements.namedItem('permission_mode').value=${selected};form.elements.namedItem('skip_acknowledgement').value=${acknowledgement};form.requestSubmit();return true})()`,
    );
    await waitFor(
      () =>
        evaluate(
          settings,
          "document.querySelector('#agent-preferences-status').value.includes('저장했습니다')",
        ),
      10_000,
      "S8_MODE_NOT_SAVED",
    );
  } finally {
    await cdp(version.webSocketDebuggerUrl, "Target.closeTarget", {
      targetId: created.targetId,
    });
    await cdp(version.webSocketDebuggerUrl, "Target.activateTarget", {
      targetId: fixtureTarget.targetId,
    });
  }
};
