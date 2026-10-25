import { DatabaseSync } from "node:sqlite";
import { IDBFactory } from "fake-indexeddb";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MigrationSession,
  ComposedMigrationPort,
  MigrationJournal,
  Mg01SettingsMigration,
  SqliteMg01Journal,
  SqlitePolicyMirror,
  SessionSecrets,
  BrowserMigrationOwner,
  lifecycleDrainPort,
  openDatabase,
  activeLegacy,
  providerSettings,
  policySource,
  savedSource,
  historySource,
  diagnosticsSource,
  diagnosticsNow,
} from "../../../dist/s36/integration.mjs";
export async function fixture(dispatch = false) {
  const dir = mkdtempSync(join(tmpdir(), "s36-joint-"));
  const path = join(dir, "migration.sqlite");
  let db = new DatabaseSync(path),
    journal = new MigrationJournal(db),
    frozen = 0,
    now = diagnosticsNow;
  const profile = "b".repeat(64);
  const factory = new IDBFactory();
  let idb = await openDatabase(factory, profile);
  const legacy = await activeLegacy(dispatch);
  let cancellations = 0,
    compatible = true,
    cdp = 0;
  const localData = {
    provider_settings: providerSettings(),
    ...policySource(),
    ...savedSource(),
    learned_page_profiles_v1: {
      schema_version: 1,
      catalog_revision: 0,
      enabled: false,
      records: [],
      receipts: [],
    },
  };
  const sessionData = {
    ...historySource(),
    ...diagnosticsSource(),
    contextpilot_pending_workflow_selections_v1: {
      schema_version: 1,
      selections: [],
    },
  };
  const sourceGuard = async (epoch) => {
    if (!frozen || epoch !== frozen || journal.state().epoch !== epoch)
      throw new Error("SOURCE_NOT_FROZEN");
  };
  const local = {
    assertFrozen: sourceGuard,
    async get() {
      return structuredClone(localData);
    },
  };
  const browserSession = {
    assertFrozen: sourceGuard,
    async get() {
      return structuredClone({ ...sessionData, ...legacy.data });
    },
  };
  const credentials = new SessionSecrets();
  const drain = (epoch) =>
    lifecycleDrainPort({
      epoch,
      requests: legacy.requests,
      assertFrozen: sourceGuard,
      cancelRun() {
        cancellations++;
      },
      async revokeSelections() {
        return 0;
      },
      async remainingActive() {
        return legacy.requests.activeContext(7) ? 1 : 0;
      },
      async reconcileOwnedCdp() {
        return cdp;
      },
    });
  const lifecycle = {
    drain: drain(1),
    async freeze(epoch) {
      frozen = epoch;
      lifecycle.drain = drain(epoch);
    },
  };
  function wire(browserOverride, releaseCheck, secretOverride = credentials) {
    const settings = new Mg01SettingsMigration(
      new SqliteMg01Journal(db),
      {
        assertFrozen: sourceGuard,
        async readProviderSettings() {
          return structuredClone(localData.provider_settings);
        },
      },
      profile,
      secretOverride,
    );
    const browser = new BrowserMigrationOwner(
      idb,
      local,
      browserSession,
      new SqlitePolicyMirror(db, profile),
      lifecycle,
      () => now,
    );
    const port = new ComposedMigrationPort(
      journal,
      browserOverride?.(browser) ?? browser,
      settings,
      releaseCheck ??
        (async (release) => compatible && release === "legacy-0.1.117"),
    );
    return { settings, browser, port, run: new MigrationSession(port) };
  }
  return {
    get db() {
      return db;
    },
    get journal() {
      return journal;
    },
    get idb() {
      return idb;
    },
    profile,
    localData,
    sessionData,
    legacy,
    credentials,
    wire,
    input: {
      migrationId: "joint",
      legacyRelease: "legacy-0.1.117",
      targetRelease: "target-fixture",
    },
    counts: () => ({ cancellations }),
    expire() {
      now += 31 * 60_000;
    },
    cdpUnknown() {
      cdp = 1;
    },
    incompatible() {
      compatible = false;
    },
    restartBackend() {
      db.close();
      db = new DatabaseSync(path);
      journal = new MigrationJournal(db);
    },
    async restartBrowser() {
      idb.close();
      idb = await openDatabase(factory, profile);
    },
    async close() {
      legacy.cleanup();
      idb.close();
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
export async function validated(f, wired = f.wire()) {
  await wired.run.prepare(f.input);
  await wired.run.copy();
  return wired;
}
