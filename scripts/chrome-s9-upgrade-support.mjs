/** Chrome profile and artifact helpers for the S9 upgrade rehearsal. */
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { openAnalysisPanel } from "./chrome-analysis-panel.mjs";
import { cdp, evaluate, reservePort, waitFor } from "./chrome-cdp-utils.mjs";

const executable = process.env.CHROME_FOR_TESTING_BIN;
if (!executable) throw new Error("CHROME_FOR_TESTING_BIN is required");
const root = process.cwd();
export const temporary = await mkdtemp(join(tmpdir(), "s9-upgrade-"));
const profile = join(temporary, "profile");
const loaded = join(temporary, "loaded-extension");
export const previous = join(temporary, "previous");
export const candidate = join(temporary, "candidate");
export const certificateDirectory = join(temporary, "cert");

export const run = (command, args, options = {}) =>
  new Promise((resolveDone, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0
        ? resolveDone()
        : reject(new Error(`${command} exited ${code}`)),
    );
  });

export const preparePrevious = async () => {
  await mkdir(previous);
  await run(
    "bash",
    ["-c", 'git archive HEAD | tar -x -C "$1"', "_", previous],
    {
      cwd: root,
    },
  );
  await symlink(resolve("node_modules"), join(previous, "node_modules"));
  await run(
    process.execPath,
    [resolve("node_modules/typescript/bin/tsc"), "-p", "tsconfig.build.json"],
    { cwd: previous },
  );
  await run(process.execPath, ["scripts/build-extension.mjs"], {
    cwd: previous,
  });
  const manifest = JSON.parse(
    await readFile(join(previous, "dist-extension/manifest.json")),
  );
  return manifest.version;
};

export const prepareCandidate = async () => {
  const currentVersion = JSON.parse(
    await readFile("extension/manifest.json", "utf8"),
  ).version;
  const archive = resolve(`dist/contextpilot-${currentVersion}.zip`);
  await run("unzip", ["-q", archive, "-d", candidate]);
  if (
    JSON.parse(await readFile(join(candidate, "manifest.json"))).version !==
    currentVersion
  )
    throw new Error("S9_ARCHIVE_VERSION_MISMATCH");
  const archiveHash = createHash("sha256")
    .update(await readFile(archive))
    .digest("hex");
  return { currentVersion, archiveHash };
};

export const launch = async (source, fixtureData, expectedVersion) => {
  await rm(loaded, { recursive: true, force: true });
  await cp(source, loaded, { recursive: true });
  const cdpPort = await reservePort();
  const child = spawn(
    executable,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--ignore-certificate-errors",
      "--host-resolver-rules=MAP s1.fixture.test 127.0.0.1",
      `--user-data-dir=${profile}`,
      `--disable-extensions-except=${loaded}`,
      `--load-extension=${loaded}`,
      `--remote-debugging-port=${cdpPort}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  try {
    const version = await waitFor(
      () =>
        fetch(`http://127.0.0.1:${cdpPort}/json/version`)
          .then((r) => r.json())
          .catch(() => undefined),
      10_000,
      "S9_CHROME_NOT_READY",
    );
    const worker = await waitFor(
      async () =>
        (
          await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((r) =>
            r.json(),
          )
        ).find(
          (item) =>
            item.type === "service_worker" &&
            item.url.endsWith("/js/service-worker.js"),
        ),
      10_000,
      "S9_WORKER_NOT_READY",
    );
    const extensionId = new URL(worker.url).host;
    const actualVersion = await evaluate(
      worker,
      "chrome.runtime.getManifest().version",
    );
    if (actualVersion !== expectedVersion)
      throw new Error(`S9_VERSION_MISMATCH: ${actualVersion}`);
    const fixtureTarget = await cdp(
      version.webSocketDebuggerUrl,
      "Target.createTarget",
      {
        url: `https://s1.fixture.test:${fixtureData.fixturePort}/`,
      },
    );
    const { panel } = await openAnalysisPanel({
      cdpPort,
      extensionId,
      fixtureTarget,
      version,
      worker,
    });
    const page = await waitFor(
      async () =>
        (
          await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((r) =>
            r.json(),
          )
        ).find((item) => item.id === fixtureTarget.targetId),
      10_000,
      "S9_PAGE_NOT_READY",
    );
    return { child, cdpPort, version, extensionId, fixtureTarget, panel, page };
  } catch (error) {
    child.kill("SIGTERM");
    await new Promise((done) => child.once("close", done));
    throw error;
  }
};

export const close = async ({ child }) => {
  child.kill("SIGTERM");
  await new Promise((done) => child.once("close", done));
};

export const assertFreshSession = async (panel) => {
  const oldTranscript = await evaluate(
    panel,
    "chrome.storage.session.get('chat_session_v1').then(item=>item.chat_session_v1?.threads?.some(thread=>thread.events?.length>0)===true)",
  );
  if (oldTranscript) throw new Error("S9_OLD_TRANSCRIPT_SURVIVED_RESTART");
};
