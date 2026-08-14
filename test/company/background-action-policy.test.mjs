import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { COMPANY_BACKGROUND_ACTIONS, isCompanyBackgroundActionAllowed } from '../../src/chrome/src/company/policy/background-action-policy.js';

assert.equal(isCompanyBackgroundActionAllowed('chat'), true);
assert.equal(isCompanyBackgroundActionAllowed('get_company_panel_state'), true);
assert.equal(isCompanyBackgroundActionAllowed('cloud_run'), false);
assert.equal(isCompanyBackgroundActionAllowed('create_scheduled_job'), false);
assert.equal(isCompanyBackgroundActionAllowed('profile_sync_now'), false);
assert.equal(isCompanyBackgroundActionAllowed('update_provider'), false);
assert.equal(isCompanyBackgroundActionAllowed('claude_oauth_start'), false);
assert.equal(isCompanyBackgroundActionAllowed('capture_full_page_screenshot'), false);
assert.equal(COMPANY_BACKGROUND_ACTIONS.has('download_file'), false);
const background = await readFile(new URL('../../src/chrome/src/background.js', import.meta.url), 'utf8');
const switchActions = [...background.matchAll(/case '([^']+)'/g)].map((match) => match[1]);
for (const action of COMPANY_BACKGROUND_ACTIONS) assert.equal(switchActions.includes(action), true, `${action} must have a handler`);
for (const action of ['cloud_run', 'create_scheduled_job', 'profile_sync_now', 'update_provider', 'claude_oauth_start', 'capture_full_page_screenshot', 'download_file']) {
  assert.equal(COMPANY_BACKGROUND_ACTIONS.has(action), false, `${action} must not be allowlisted`);
}
const handler = background.slice(background.indexOf('async function handleMessage'));
assert.ok(handler.indexOf('isCompanyBackgroundActionAllowed(msg.action)') < handler.indexOf('await providerManager.load()'), 'deny gate must execute before hydration');
console.log('company background action policy tests passed');
