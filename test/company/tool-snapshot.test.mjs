import assert from 'node:assert/strict';
import { getToolsForMode } from '../../src/chrome/src/agent/tools.js';

const expected = ['clarify', 'done', 'find_text', 'get_accessibility_tree', 'read_page'];
for (const mode of ['ask', 'act']) {
  assert.deepEqual(getToolsForMode(mode).map((tool) => tool.function.name).sort(), expected);
}
assert.deepEqual(getToolsForMode('dev').map((tool) => tool.function.name), []);
console.log('company tool snapshot tests passed');
