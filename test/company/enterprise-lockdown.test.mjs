import assert from 'node:assert/strict';
import { normalizeCompanyConfig } from '../../src/chrome/src/company/config/managed-config.js';
import { evaluateCompanyTool, isAllowedCompanyOrigin } from '../../src/chrome/src/company/policy/company-policy.js';
import { companyToolNamesForMode } from '../../src/chrome/src/company/tools/tool-registry.js';

const config = normalizeCompanyConfig({
  provider: { baseUrl: 'https://ai.company.net/v1', model: 'Qwen3.5-32B-Instruct' },
  allowedOrigins: ['https://eda.company.net'],
});

assert.deepEqual(companyToolNamesForMode('ask'), [
  'clarify', 'done', 'find_text', 'get_accessibility_tree', 'read_page',
]);
assert.deepEqual(companyToolNamesForMode('act'), [
  'clarify', 'done', 'find_text', 'get_accessibility_tree', 'get_select_options', 'hover', 'read_page',
  'scroll', 'select_option', 'set_checked', 'set_field', 'type_ax', 'verify_form', 'wait_for_element',
]);
assert.equal(evaluateCompanyTool({ name: 'read_page', mode: 'ask', pageUrl: 'https://outside.example', config }).allowed, true);
assert.equal(evaluateCompanyTool({ name: 'click_ax', mode: 'ask', pageUrl: 'https://eda.company.net/equipment', config }).code, 'COMPANY_TOOL_DENIED');
assert.equal(evaluateCompanyTool({ name: 'click_ax', mode: 'act', pageUrl: 'https://outside.example', config }).code, 'COMPANY_TOOL_DENIED');
assert.equal(evaluateCompanyTool({ name: 'execute_js', mode: 'act', pageUrl: 'https://eda.company.net/equipment', config }).code, 'COMPANY_TOOL_DENIED');
assert.equal(isAllowedCompanyOrigin('https://eda.company.net/equipment', config), true);
assert.equal(isAllowedCompanyOrigin('https://outside.example/equipment', config), false);
assert.deepEqual(normalizeCompanyConfig({ allowedOrigins: ['http://bad.example', 'https://eda.company.net/path'] }).allowedOrigins, ['https://eda.company.net']);

console.log('company enterprise-lockdown tests passed');
