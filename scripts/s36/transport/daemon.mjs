import { DatabaseSync } from "node:sqlite";
import { closeSync, lstatSync, openSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  readConfig,
  listenLocal,
  stopLocal,
  migrationEndpoint,
  SessionSecrets,
  LinuxSecretServiceStore,
  migrationProfileGuard,
} from "../../../dist/s36/transport.mjs";
// Explicit qualification daemon, never selected by the product or the normal S28 launcher.
const configPath = resolve(process.argv[2] ?? "");
let db, server;
try {
  const config = await readConfig(configPath),
    directory = dirname(configPath),
    path = `${directory}/migration.sqlite`;
  const parent = lstatSync(directory);
  if (
    !parent.isDirectory() ||
    parent.isSymbolicLink() ||
    parent.uid !== process.getuid() ||
    parent.mode & 0o077
  )
    throw new Error("MIGRATION_DIRECTORY");
  process.umask(0o077);
  try {
    closeSync(openSync(path, "wx", 0o600));
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  const info = lstatSync(path);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.uid !== process.getuid() ||
    info.mode & 0o077
  )
    throw new Error("MIGRATION_DATABASE");
  db = new DatabaseSync(path);
  let store;
  if (process.argv[3] === "--settings-session-only")
    store = new SessionSecrets();
  else if (process.argv[3] === "--settings-os-store" && process.argv[4])
    store = await LinuxSecretServiceStore.connect(
      resolve(process.argv[4]),
      await migrationProfileGuard(config.installationId, config.profileId),
    );
  else if (process.argv[3]) throw new Error("MIGRATION_SETTINGS_CONFIGURATION");
  server = await listenLocal(
    config.socketPath,
    config,
    await migrationEndpoint(db, config, store),
  );
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    void stopLocal(server).finally(() => db.close());
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
} catch {
  db?.close();
  process.exitCode = 1;
}
