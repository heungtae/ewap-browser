import { DatabaseSync } from "node:sqlite";
import {
  closeSync,
  lstatSync,
  openSync,
  realpathSync,
  existsSync,
  unlinkSync,
} from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { readConfig } from "../../../apps/agent-server/src/native/config.ts";
import {
  listenLocal,
  stopLocal,
} from "../../../apps/agent-server/src/ipc/server.ts";
import { migrationEndpoint } from "../../../apps/agent-server/src/migration/rpc.ts";
import { verifyReleaseSet } from "../../../apps/agent-server/src/migration/release-set.ts";
import { SessionSecrets } from "../../../apps/agent-server/src/settings/service.ts";
import { LinuxSecretServiceStore } from "../../../apps/agent-server/src/settings/linux-secret-store.ts";
import { migrationProfileGuard } from "../../../packages/shared/src/migration-rpc.ts";
import { acquireInstallLock } from "../../../apps/agent-server/src/migration/install-files.ts";
// Explicit qualification entrypoint. No test helpers, remote prepare/commit or default activation.
let db, server, lock, lockPath, releaseInstallation;
let stopping = false,
  shutdown;
const releaseLock = () => {
  if (lock === undefined) return;
  closeSync(lock);
  lock = undefined;
  unlinkSync(lockPath);
};
const close = () => {
  db?.close();
  db = undefined;
  releaseLock();
  releaseInstallation?.();
};
const stopServer = () => (shutdown ??= stopLocal(server).finally(close));
const stop = () => {
  stopping = true;
  if (server)
    void stopServer().catch(() => {
      process.exitCode = 1;
    });
};
const assertStarting = () => {
  if (stopping) throw new Error("MIGRATION_STOPPED");
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
try {
  const [releaseId, configPath, mode, ...extra] = process.argv.slice(2);
  if (
    !configPath ||
    !isAbsolute(configPath) ||
    resolve(configPath) !== configPath ||
    extra.length ||
    !["--settings-session-only", "--settings-os-store"].includes(mode)
  )
    throw new Error("MIGRATION_CONFIGURATION");
  const root = dirname(import.meta.dirname);
  verifyReleaseSet(root, releaseId);
  const directory = dirname(configPath),
    parent = lstatSync(directory);
  if (
    realpathSync(directory) !== directory ||
    !parent.isDirectory() ||
    parent.uid !== process.getuid() ||
    parent.mode & 0o077
  )
    throw new Error("MIGRATION_DIRECTORY");
  releaseInstallation = acquireInstallLock(directory);
  const config = await readConfig(configPath);
  assertStarting();
  if (config.socketPath !== `${directory}/agent.sock`)
    throw new Error("MIGRATION_SOCKET");
  if (existsSync(config.socketPath)) throw new Error("MIGRATION_ACTIVE");
  lockPath = `${directory}/migration-daemon.lock`;
  lock = openSync(lockPath, "wx", 0o600);
  const store =
    mode === "--settings-session-only"
      ? new SessionSecrets()
      : await LinuxSecretServiceStore.connect(
          `${import.meta.dirname}/secret-service.py`,
          await migrationProfileGuard(config.installationId, config.profileId),
        );
  assertStarting();
  process.umask(0o077);
  const path = `${directory}/migration.sqlite`;
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
  server = await listenLocal(
    config.socketPath,
    config,
    await migrationEndpoint(db, config, store),
  );
  if (stopping) await stopServer();
} catch (error) {
  close();
  if (error.message !== "MIGRATION_STOPPED") process.exitCode = 1;
}
