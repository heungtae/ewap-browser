import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { chmod, readFile } from "node:fs/promises";
import { build } from "esbuild";
import { installRelease } from "../../../dist/s36/installation.mjs";
import {
  migrationProfileGuard,
  MigrationJournal,
} from "../../../dist/s36/transport.mjs";
import { evaluate } from "../../chrome-cdp-utils.mjs";
export async function prepareTransfer(input, panel, mode) {
  const prepared = installRelease(input),
    config = JSON.parse(await readFile(prepared.configPath, "utf8"));
  const profileGuard = await migrationProfileGuard(
    config.installationId,
    config.profileId,
  );
  await injectSettings(panel);
  const preparation = await evaluate(
    panel,
    `S36Settings.prepare(${JSON.stringify(profileGuard)},${JSON.stringify(mode)},${process.env.S36_INSTALLED_JOINT === "1"},${process.env.S36_INSTALLED_ALL === "1"}).then(value=>({ok:true,...value})).catch(error=>({ok:false,error:error.message}))`,
  );
  assert.equal(preparation?.ok, true, preparation?.error);
  const { digest, policyDigest } = preparation;
  if (policyDigest !== undefined) assert.match(policyDigest, /^[a-f0-9]{64}$/);
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.match(profileGuard, /^[a-f0-9]{64}$/);
  const dbPath = `${input.directory}/migration.sqlite`;
  const db = new DatabaseSync(dbPath),
    journal = new MigrationJournal(db);
  const epoch = journal.fence();
  journal.write(undefined, {
    manifest: {
      migrationId: "wire",
      profileGuard,
      sourceSchemas: "controlled-source",
      targetSchemas: "controlled-target",
      legacyRelease: "legacy",
      targetRelease: "target",
      sourceDigests: Object.fromEntries(
        ["MG01", "MG02", "MG03", "MG04", "MG05", "MG06"].map((unit) => [
          unit,
          preparation.sourceDigests?.[unit] ??
            (unit === "MG02" && policyDigest ? policyDigest : digest),
        ]),
      ),
    },
    revision: 0,
    epoch,
    phase: "prepared",
    stores: {},
    acknowledgments: {},
  });
  db.close();
  await chmod(dbPath, 0o600);
  return { prepared, config, dbPath };
}

export async function injectSettings(panel) {
  const fixture = await build({
    entryPoints: [
      "extension/tests/fixture/s36/settings-transfer-chrome-cases.ts",
    ],
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    globalName: "S36Settings",
  });
  await evaluate(
    panel,
    "globalThis.s36CspViolations=0; addEventListener('securitypolicyviolation',()=>globalThis.s36CspViolations++); true",
  );
  await evaluate(panel, fixture.outputFiles[0].text);
}
