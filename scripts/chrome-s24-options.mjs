import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { cdp, evaluate, waitFor } from "./chrome-cdp-utils.mjs";
import { openLearnedProfileManager } from "./chrome-learned-profile-manager.mjs";
import { verifyManagerPagination } from "./chrome-learned-profile-pagination.mjs";
import { verifyManagerEditor } from "./chrome-learned-profile-editor.mjs";
export async function verifyS24Options({
  settings,
  send,
  harness,
  run,
  evidence,
  second,
}) {
  const options = settings;
  settings = await openLearnedProfileManager(options, harness);
  await evaluate(
    settings,
    "document.querySelector('#learned-profile-refresh').click()",
  );
  await waitFor(
    () =>
      evaluate(
        settings,
        "document.querySelectorAll('#learned-profiles button').length===1",
      ),
    10000,
    "PROFILE_OPTIONS_LIST",
  );
  await evaluate(
    settings,
    "document.querySelector('#learned-profiles button').click()",
  );
  await waitFor(
    () =>
      evaluate(
        settings,
        "document.querySelector('#learned-profile-json')?.textContent.includes('local_success')",
      ),
    10000,
    "PROFILE_DETAIL",
  );
  assert.equal(
    await evaluate(
      settings,
      "getComputedStyle(document.querySelector('.learned-profile-controls')).gap",
    ),
    "14px",
  );
  await cdp(settings.webSocketDebuggerUrl, "Runtime.evaluate", {
    expression:
      "document.querySelector('#learned-profile-section').scrollIntoView()",
  });
  const screenshot = await cdp(
    settings.webSocketDebuggerUrl,
    "Page.captureScreenshot",
    { format: "png" },
  );
  await writeFile(
    process.env.S24_SCREENSHOT ?? "/tmp/s24-options.png",
    Buffer.from(screenshot.data, "base64"),
  );
  assert.equal(
    (
      await send({
        operation: "feature",
        revision: second.catalog_revision,
        patch: { enabled: false },
      })
    ).ok,
    true,
  );
  const off = await send({ operation: "list" });
  const offTurn = evidence.length;
  await evaluate(
    options,
    "chrome.windows.getCurrent().then(w => chrome.windows.update(w.id, {focused:true}))",
  );
  await cdp(harness.version.webSocketDebuggerUrl, "Target.activateTarget", {
    targetId: harness.fixtureTarget.targetId,
  });
  await run("off-page-help: Explain this page with current context.");
  assert.ok(
    evidence
      .slice(offTurn)
      .every(
        (r) =>
          !r.tools.includes("describe_learned_task") &&
          !r.tools.some((name) => name.startsWith("page_cmd_")),
      ),
  );
  assert.equal(off.enabled, false);
  assert.equal(off.records.length, 1);
  assert.equal(
    (
      await send({
        operation: "update",
        revision: second.catalog_revision,
        profile_id: second.records[0].profile_id,
        patch: { name: "stale write" },
      })
    ).ok,
    false,
  );
  assert.equal(
    (
      await send({
        operation: "delete",
        revision: off.catalog_revision,
        profile_id: off.records[0].profile_id,
      })
    ).ok,
    true,
  );
  assert.equal((await send({ operation: "list" })).records.length, 0);
  await verifyManagerPagination(settings, options, second.records[0]);
  await verifyManagerEditor(settings, options);
  await writeFile(
    process.env.S24_REPORT ?? "/tmp/s24-smoke.json",
    JSON.stringify(
      {
        scope: process.env.S24_LIVE_MODEL
          ? "live_provider_isolated_chrome_fixture"
          : "controlled_chrome_fixture",
        checks: [
          "save",
          "request_local_command_schema",
          "same_tool_call_id_continuation",
          "reuse",
          "privacy",
          "trusted_settings_sender",
          "options_14px_spacing",
          "separate_profile_window_reused",
          "profile_search_selection_pagination",
          "profile_rename_delete_pagination_recovery",
          "profile_notes_enabled_auto_update_rediscovery",
          "options_manager_feature_sync",
          "stale_editor_rejection_and_recovery",
          "recipe_delete_clear_confirmations",
          "manager_responsive_layout",
          "off_retains_records",
          "stale_management_rejection",
          "delete",
        ],
        provider_turns: evidence,
      },
      null,
      2,
    ),
  );
}
