import { mkdir, readFile, writeFile } from 'node:fs/promises';

const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url)));
const components = Object.entries(lock.packages || {})
  .filter(([path]) => path.startsWith('node_modules/'))
  .map(([path, value]) => ({ name: path.slice('node_modules/'.length), version: value.version || 'unknown', license: value.license || 'unreviewed' }))
  .sort((a, b) => a.name.localeCompare(b.name));
const sbom = { format: 'company-minimal-sbom-v1', generatedAt: '2026-08-15', application: { name: lock.packages?.['']?.name || 'webbrain', version: lock.packages?.['']?.version || 'unknown', license: lock.packages?.['']?.license || 'unreviewed' }, components };
await mkdir(new URL('../artifacts/release/', import.meta.url), { recursive: true });
await writeFile(new URL('../artifacts/release/company-sbom-2026-08-15.json', import.meta.url), `${JSON.stringify(sbom, null, 2)}\n`);
console.log(JSON.stringify({ components: components.length }));
