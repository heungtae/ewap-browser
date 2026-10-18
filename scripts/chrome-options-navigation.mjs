import assert from "node:assert/strict";
import { evaluate, waitFor } from "./chrome-cdp-utils.mjs";
export const checkOptionsNavigation = async (settings, checks) => {
  assert.deepEqual(
    await evaluate(
      settings,
      "[...document.querySelectorAll('[data-settings-page]')].filter(e=>!e.hidden).map(e=>e.id)",
    ),
    ["models"],
  );
  for (const page of ["agent", "automation", "enterprise", "models"]) {
    await evaluate(
      settings,
      `document.querySelector('.settings-nav a[href="#${page}"]').click()`,
    );
    await waitFor(
      () => evaluate(settings, `!document.getElementById('${page}').hidden`),
      5000,
      "NAVIGATION",
    );
    assert.equal(
      await evaluate(
        settings,
        "document.querySelectorAll('.settings-nav a[aria-current=page]').length",
      ),
      1,
    );
  }
  await evaluate(settings, "location.hash='unknown'");
  await waitFor(
    () => evaluate(settings, "!document.getElementById('models').hidden"),
    5000,
    "INVALID_HASH",
  );
  assert.equal(
    await evaluate(
      settings,
      "document.querySelector('#provider-form details').open",
    ),
    false,
  );
  assert.equal(
    await evaluate(
      settings,
      "[...document.querySelectorAll('.form-save-state')].every(e=>!e.textContent)",
    ),
    true,
  );
  await evaluate(settings, "location.hash='agent'");
  await waitFor(
    () => evaluate(settings, "!document.getElementById('agent').hidden"),
    5000,
    "AGENT_PAGE",
  );
  assert.equal(
    await evaluate(
      settings,
      "document.querySelector('#approval-categories').hidden",
    ),
    true,
  );
  await evaluate(
    settings,
    `(()=>{const m=document.querySelector('[name=approval_mode]');m.value='custom';m.dispatchEvent(new Event('change',{bubbles:true}));return true})()`,
  );
  assert.equal(
    await evaluate(
      settings,
      "document.querySelector('#approval-categories').hidden",
    ),
    false,
  );
  assert.equal(
    await evaluate(
      settings,
      "document.querySelector('#agent-preferences-form .form-save-state').textContent.includes('저장하지 않은')",
    ),
    true,
  );
  await evaluate(
    settings,
    "document.querySelector('#agent-preferences-form').requestSubmit()",
  );
  await waitFor(
    () =>
      evaluate(
        settings,
        "document.querySelector('#agent-preferences-status').value.includes('저장했습니다')",
      ),
    5000,
    "AGENT_SAVED",
  );
  assert.equal(
    await evaluate(
      settings,
      "document.querySelector('#agent-preferences-form .form-save-state').textContent",
    ),
    "",
  );
  await evaluate(settings, "location.hash='models'");
  await waitFor(
    () => evaluate(settings, "!document.getElementById('models').hidden"),
    5000,
    "MODELS_PAGE",
  );
  checks.push(
    "navigation, fallback hash, current page semantics, collapsed advanced controls, custom approval controls and dirty/save feedback",
  );
};
