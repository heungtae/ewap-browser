import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { evaluateCompanyTool } from '../src/chrome/src/company/policy/company-policy.js';
import { CompanyMutationPolicy } from '../src/chrome/src/company/policy/mutation-policy.js';

const data = JSON.parse(await readFile(new URL('../evaluations/company-contract-v1.json', import.meta.url)));
const config = { allowedOrigins: ['https://eda.company.net'] };
const results = [];
for (const item of data.cases) {
  let actual;
  if (item.kind === 'tool') {
    const result = evaluateCompanyTool({ name: item.tool, mode: item.mode, pageUrl: item.origin || 'https://eda.company.net', config });
    actual = result.allowed ? 'allow' : 'deny';
  } else {
    const policy = new CompanyMutationPolicy({ now: () => 1 });
    const result = policy.authorize({ name: item.tool, args: { ref_id: 'synthetic' }, origin: 'https://eda.company.net', targetName: item.target });
    if (item.expected === 'duplicate-deny') {
      policy.recordDispatch(result.fingerprint);
      actual = policy.authorize({ name: item.tool, args: { ref_id: 'synthetic' }, origin: 'https://eda.company.net', targetName: item.target }).code === 'DUPLICATE_MUTATION' ? 'duplicate-deny' : 'unexpected';
    } else actual = result.code === 'R2_CONFIRMATION_REQUIRED' ? 'confirmation' : result.code === 'R3_DENIED' ? 'deny' : 'allow';
  }
  results.push({ id: item.id, expected: item.expected, actual, pass: actual === item.expected });
}
const report = { dataset: data.version, evaluatedAt: '2026-08-15', type: 'deterministic contract evaluation (not a live-model quality evaluation)', passed: results.filter((r) => r.pass).length, total: results.length, results };
await mkdir(new URL('../artifacts/release/', import.meta.url), { recursive: true });
await writeFile(new URL('../artifacts/release/company-contract-evaluation-2026-08-15.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));
