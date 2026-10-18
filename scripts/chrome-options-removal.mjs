import assert from "node:assert/strict";
import { evaluate, waitFor } from "./chrome-cdp-utils.mjs";
export const checkOptionsRemoval = async (settings, harness, checks) => {
  await evaluate(
    settings,
    "location.hash='models';document.querySelector('#provider-management-status').value='cancel-sentinel';document.querySelector('#provider-remove-delete').click()",
  );
  await waitFor(
    () =>
      evaluate(
        settings,
        "!document.querySelector('#provider-remove-delete').disabled",
      ),
    5000,
    "DELETE_CANCELLED",
  );
  assert.equal(
    await evaluate(
      settings,
      "document.querySelector('#provider-management-status').value",
    ),
    "cancel-sentinel",
  );
  assert.ok(
    (await harness.send({ kind: "PROVIDER_LIST" })).providers["ux-secondary"],
  );
  await evaluate(
    settings,
    "window.confirm=()=>true;document.querySelector('#provider-remove-delete').click()",
  );
  await waitFor(
    () =>
      evaluate(
        settings,
        "document.querySelector('#provider-management-status').value==='Provider를 삭제했습니다.'",
      ),
    5000,
    "DELETE_APPLIED",
  );
  assert.equal(
    (await harness.send({ kind: "PROVIDER_LIST" })).providers["ux-secondary"],
    undefined,
  );
  assert.equal(
    await evaluate(
      settings,
      "document.querySelector('#provider-primary-select').value",
    ),
    "fixture",
  );
  assert.equal(
    await evaluate(
      settings,
      "document.querySelector('[name=provider_id]').value",
    ),
    "fixture",
  );
  checks.push(
    "cancelled Provider deletion changes neither storage nor status; confirmed deletion selects and loads a remaining Provider",
  );
};
