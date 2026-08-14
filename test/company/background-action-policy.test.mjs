import assert from 'node:assert/strict';
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
console.log('company background action policy tests passed');
