import assert from 'node:assert/strict';
import { verifyCompanyAction } from '../../src/chrome/src/company/verifier/action-verifier.js';

assert.equal(verifyCompanyAction({ name: 'set_field', response: { success: true, verified: true } }).outcome, 'VERIFIED');
const unknown = verifyCompanyAction({ name: 'set_checked', response: { success: false, dispatched: true } });
assert.equal(unknown.outcome, 'UNKNOWN');
assert.equal(unknown.retryable, false);
assert.equal(verifyCompanyAction({ name: 'select_option', response: { success: false, dispatched: false } }).outcome, 'FAILED');
console.log('company action verifier tests passed');
