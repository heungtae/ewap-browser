import assert from 'node:assert/strict';
import { getToolsForMode } from '../../src/chrome/src/agent/tools.js';

const expected = ['clarify', 'done', 'find_text', 'get_accessibility_tree', 'read_page'];
assert.deepEqual(getToolsForMode('ask').map((tool) => tool.function.name).sort(), expected);
assert.deepEqual(getToolsForMode('act').map((tool) => tool.function.name).sort(), [
  ...expected,
  'get_select_options', 'hover', 'scroll', 'select_option', 'set_checked', 'set_field', 'type_ax', 'verify_form', 'wait_for_element',
].sort());
assert.deepEqual(getToolsForMode('dev').map((tool) => tool.function.name), []);
assert.deepEqual(
  getToolsForMode('act', { companyAllowedToolNames: new Set(expected) }).map((tool) => tool.function.name).sort(),
  expected,
);
console.log('company tool snapshot tests passed');
