import assert from 'node:assert/strict';
import { CompanyMutationPolicy, classifyCompanyRisk, mutationFingerprint } from '../../src/chrome/src/company/policy/mutation-policy.js';

assert.equal(classifyCompanyRisk({ name: 'set_field' }).risk, 'R1');
assert.equal(classifyCompanyRisk({ name: 'click_ax', targetName: 'Save' }).risk, 'R2');
assert.equal(classifyCompanyRisk({ name: 'click_ax', targetName: 'Delete equipment' }).risk, 'R3');
assert.equal(mutationFingerprint({ name: 'set_field', args: { ref_id: 'r1', text: 'secret' }, origin: 'https://eda.company.net' }).includes('secret'), false);

const policy = new CompanyMutationPolicy({ now: () => 1 });
const requested = policy.authorize({ name: 'click_ax', args: { ref_id: 'r1' }, origin: 'https://eda.company.net', targetName: 'Save' });
assert.equal(requested.code, 'R2_CONFIRMATION_REQUIRED');
assert.equal(policy.approve(requested.confirmationId), true);
const approved = policy.authorize({ name: 'click_ax', args: { ref_id: 'r1' }, origin: 'https://eda.company.net', targetName: 'Save', confirmationId: requested.confirmationId });
assert.equal(approved.allowed, true);
policy.recordDispatch(approved.fingerprint);
assert.equal(policy.authorize({ name: 'click_ax', args: { ref_id: 'r1' }, origin: 'https://eda.company.net', targetName: 'Save' }).code, 'DUPLICATE_MUTATION');
assert.equal(policy.authorize({ name: 'click_ax', args: { ref_id: 'r2' }, origin: 'https://eda.company.net', targetName: 'Delete' }).code, 'R3_DENIED');
console.log('company mutation policy tests passed');
