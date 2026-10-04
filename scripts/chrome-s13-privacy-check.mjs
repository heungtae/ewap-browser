import assert from "node:assert/strict";
import { evaluate, waitFor } from "./chrome-cdp-utils.mjs";
import { checkDiagnosticsZip } from "./chrome-diagnostics-zip-check.mjs";

const assertRedacted = (value) => {
  const text = JSON.stringify(value);
  for (const marker of [
    "S13_PRIVATE_RECORD",
    "S13_SECRET_TOKEN",
    "readSummary",
  ])
    assert.equal(
      text.includes(marker),
      false,
      `persisted/exported ${marker}: ${text.slice(Math.max(0, text.indexOf(marker) - 100), text.indexOf(marker) + 100)}`,
    );
};

/** Inspect successful diagnostics responses and the actual Panel ZIP payload. */
export const checkS13Privacy = async ({ send, panel }) => {
  const requestId = await evaluate(panel, "s13RequestId");
  const exported = await send({
    schema_version: 1,
    kind: "DIAGNOSTICS_BUNDLE_EXPORT",
    request_id: requestId,
  });
  assert.equal(exported.ok, true);
  assertRedacted(exported);
  const diagnostics = await send({
    schema_version: 1,
    kind: "DIAGNOSTICS_LIST",
    request_id: requestId,
    after_sequence: 0,
    limit: 100,
  });
  assert.equal(diagnostics.ok, true);
  assert.ok(Array.isArray(diagnostics.records));
  assertRedacted(diagnostics);
  assertRedacted(
    await evaluate(
      panel,
      "Promise.all([chrome.storage.local.get(null),chrome.storage.session.get(null)])",
    ),
  );
  await evaluate(
    panel,
    `(() => {
      window.s13Downloads = [];
      const original = URL.createObjectURL.bind(URL);
      URL.createObjectURL = blob => {
        blob.arrayBuffer().then(buffer => window.s13Downloads.push(Array.from(new Uint8Array(buffer))));
        return original(blob);
      };
      HTMLAnchorElement.prototype.click = function() {};
      document.querySelector('#diagnostics-export').click();
      return true;
    })()`,
  );
  const bytes = await waitFor(
    () => evaluate(panel, "s13Downloads.at(-1)"),
    10000,
    "S13 diagnostics ZIP was not produced",
  );
  assertRedacted(checkDiagnosticsZip(bytes));
  console.log(
    "S13 storage, diagnostics and actual ZIP contents passed non-disclosure and archive integrity checks",
  );
};
