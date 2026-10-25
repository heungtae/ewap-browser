import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { chmod, copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { LinuxSecretServiceStore } from "../../../dist/s36/linux-secret-store.mjs";
const exec = promisify(execFile);
export async function isolatedKeyring() {
  if (!process.env.S36_PRIVATE_SECRET_BUS)
    throw new Error("USE_ISOLATED_RUNNER");
  const ownership = await exec(
    "/usr/bin/python3",
    [
      "-I",
      "-c",
      "import dbus; print(int(dbus.SessionBus().name_has_owner('org.freedesktop.secrets')))",
    ],
    { timeout: 3000 },
  );
  if (ownership.stdout.trim() !== "0")
    throw new Error("PRIVATE_BUS_ALREADY_OWNED");
  const root = await mkdtemp(`${tmpdir()}/s36-keyring-`);
  for (const name of ["data", "run", "control"])
    await mkdir(`${root}/${name}`, { mode: 0o700 });
  const helper = `${root}/secret-service.py`;
  await copyFile(resolve("native-host/secret-service.py"), helper);
  await chmod(helper, 0o600);
  const original = {
    XDG_DATA_HOME: process.env.XDG_DATA_HOME,
    XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR,
  };
  process.env.XDG_DATA_HOME = `${root}/data`;
  process.env.XDG_RUNTIME_DIR = `${root}/run`;
  const password = randomBytes(24).toString("hex");
  let daemon, closed;
  async function start(unlock = true) {
    daemon = spawn(
      "/usr/bin/gnome-keyring-daemon",
      [
        "--foreground",
        "--components=secrets",
        `--control-directory=${root}/control`,
        ...(unlock ? ["--unlock"] : []),
      ],
      {
        stdio: ["pipe", "ignore", "ignore"],
        env: { ...process.env, DISPLAY: "", WAYLAND_DISPLAY: "" },
      },
    );
    closed = new Promise((r) => daemon.once("close", r));
    daemon.stdin.end(unlock ? password : "");
    for (let i = 0; i < 30; i++) {
      const { stdout } = await exec(
        "/usr/bin/python3",
        [
          "-I",
          "-c",
          "import dbus; print(int(dbus.SessionBus().name_has_owner('org.freedesktop.secrets')))",
        ],
        { timeout: 3000 },
      );
      if (stdout.trim() === "1") return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("SECRET_DAEMON_NOT_READY");
  }
  async function connect(profile = "b".repeat(64)) {
    return LinuxSecretServiceStore.connect(helper, profile);
  }
  await start();
  let store;
  for (let i = 0; i < 20; i++) {
    try {
      store = await connect();
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  if (!store) {
    daemon.kill("SIGTERM");
    await closed;
    for (const [key, value] of Object.entries(original))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    await rm(root, { recursive: true, force: true });
    throw new Error("SECRET_COLLECTION_NOT_READY");
  }
  return {
    root,
    helper,
    store,
    connect,
    start,
    async stop() {
      daemon.kill("SIGTERM");
      await closed;
    },
    async unlock() {
      daemon.kill("SIGTERM");
      await closed;
      await start(true);
      for (let i = 0; i < 20; i++) {
        try {
          await connect();
          return;
        } catch {
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      throw new Error("TEST_UNLOCK_FAILED");
    },
    async lock() {
      await exec(
        "/usr/bin/python3",
        [
          "-I",
          "-c",
          "import gi; gi.require_version('Secret','1'); from gi.repository import Secret; s=Secret.Service.get_sync(Secret.ServiceFlags.NONE,None); c=Secret.Collection.for_alias_sync(s,'default',Secret.CollectionFlags.NONE,None); s.lock_sync([c],None)",
        ],
        { timeout: 3000 },
      );
    },
    async close() {
      daemon.kill("SIGTERM");
      await closed;
      for (const [key, value] of Object.entries(original))
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      await rm(root, { recursive: true, force: true });
    },
  };
}
