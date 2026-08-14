import assert from 'node:assert/strict';
import { CompanyAuditRecorder, redactAuditEvent } from '../../src/chrome/src/company/audit/audit-recorder.js';

const raw = {
  tool: 'set_field', mode: 'act', origin: 'https://eda.company.net/equipment/1?secret=no', risk: 'R1',
  outcome: 'VERIFIED', success: true, dispatched: true, policy: 'ALLOW',
  text: 'password=not-recorded', pageContent: 'raw page text', authorization: 'Bearer hidden',
};
const event = redactAuditEvent(raw);
assert.deepEqual(Object.keys(event).sort(), ['dispatched', 'mode', 'origin', 'outcome', 'policy', 'risk', 'success', 'timestamp', 'tool']);
assert.equal(JSON.stringify(event).includes('not-recorded'), false);
assert.equal(JSON.stringify(event).includes('raw page text'), false);
assert.equal(event.origin, 'https://eda.company.net');
const recorder = new CompanyAuditRecorder({ limit: 1 });
await recorder.record(raw);
await recorder.record({ tool: 'done', mode: 'ask' });
assert.equal(recorder.snapshot().length, 1);
console.log('company audit recorder tests passed');
