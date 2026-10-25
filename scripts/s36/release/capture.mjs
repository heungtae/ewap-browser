import {
  cpSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import {
  captureReleaseSet,
  releaseSetId,
  verifyReleaseSet,
} from "../../../dist/s36/release-set.mjs";
import { files, git } from "../../s26-inventory.mjs";
const output = resolve(process.argv[2] ?? "dist/s36/release-candidate");
const linuxSecrets = process.argv[3] === "--linux-secrets";
if ((process.argv.length > 4 && !linuxSecrets) || process.argv.length > 5)
  throw new Error("USAGE: capture.mjs [directory] [--linux-secrets]");
if (existsSync(output))
  throw new Error("OUTPUT_EXISTS: choose a fresh destination");
for (const path of [
  "dist/s28/chrome-extension/manifest.json",
  "dist/s28/agent-server/launcher.cjs",
])
  if (!existsSync(path)) throw new Error(`BUILD_S28_FIRST: ${path}`);
if (linuxSecrets)
  for (const file of [
    "linux-secret-store.mjs",
    "secret-service.py",
    "migration-daemon.mjs",
  ])
    if (!existsSync(`dist/s36/${file}`))
      throw new Error(`BUILD_S36_SECRETS_FIRST: ${file}`);
mkdirSync(output, { recursive: true });
cpSync("dist/s28/chrome-extension", `${output}/chrome-extension`, {
  recursive: true,
});
cpSync("dist/s28/agent-server", `${output}/agent-server`, { recursive: true });
if (linuxSecrets)
  for (const file of [
    "linux-secret-store.mjs",
    "secret-service.py",
    "migration-daemon.mjs",
  ]) {
    cpSync(`dist/s36/${file}`, `${output}/agent-server/${file}`);
    chmodSync(`${output}/agent-server/${file}`, 0o600);
  }
const manifests = files().filter((path) =>
  /^(apps|packages)\/[^/]+\/package\.json$/.test(path),
);
for (const path of [
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  ...manifests,
]) {
  const destination = resolve(output, "dependencies", path);
  mkdirSync(resolve(destination, ".."), { recursive: true });
  cpSync(path, destination);
}
const source = {
  revision: git("rev-parse", "HEAD").trim(),
  dirty: Boolean(git("status", "--porcelain").trim()),
};
const manifest = captureReleaseSet(output, source);
writeFileSync(
  `${output}/release-set.json`,
  JSON.stringify(manifest, null, 2) + "\n",
);
const releaseId = releaseSetId(manifest);
verifyReleaseSet(output, releaseId);
const report = {
  result: "PASS",
  scope: manifest.scope,
  releaseId,
  source,
  versions: manifest.versions,
  protocol: manifest.protocol,
  credentials: manifest.credentials,
  linuxSecretsPackaged: linuxSecrets,
  files: manifest.files.length,
  bytes: manifest.files.reduce((sum, file) => sum + file.bytes, 0),
  registered: false,
  installed: false,
  delivered: false,
  productionAdmission: "unchanged",
  directory: output,
};
const evidence = process.env.S36_RELEASE_EVIDENCE_DIR;
if (evidence) {
  mkdirSync(evidence, { recursive: true });
  writeFileSync(
    `${evidence}/report.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  writeFileSync(
    `${evidence}/release-set.json`,
    readFileSync(`${output}/release-set.json`),
  );
}
console.log(JSON.stringify(report));
