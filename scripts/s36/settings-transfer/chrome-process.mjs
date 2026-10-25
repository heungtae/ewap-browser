import { spawn } from "node:child_process";
import { resolve } from "node:path";
import {
  reservePort,
  waitFor,
  cdp,
  evaluate,
} from "../../chrome-cdp-utils.mjs";
export async function openChrome(profile) {
  const extension = resolve(
    process.env.S36_INSTALL_RELEASE_DIR,
    "chrome-extension",
  );
  const port = await reservePort();
  const child = spawn(
    process.env.CHROME_FOR_TESTING_BIN,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      `--user-data-dir=${profile}`,
      `--remote-debugging-port=${port}`,
      `--load-extension=${extension}`,
      `--disable-extensions-except=${extension}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  const closed = new Promise((resolve) => child.once("close", resolve));
  const deadline = setTimeout(() => child.kill("SIGKILL"), 50000);
  const stop = async () => {
    child.kill("SIGTERM");
    await closed;
    clearTimeout(deadline);
  };
  try {
    const targets = () =>
      fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
    const worker = await waitFor(
      async () => {
        try {
          return (await targets()).find(
            (t) =>
              t.type === "service_worker" &&
              t.url.endsWith("/js/service-worker.js"),
          );
        } catch {
          return undefined;
        }
      },
      15000,
      "WORKER_READY",
    );
    const extensionId = new URL(worker.url).host;
    const version = await fetch(`http://127.0.0.1:${port}/json/version`).then(
      (r) => r.json(),
    );
    const created = await cdp(
      version.webSocketDebuggerUrl,
      "Target.createTarget",
      { url: `chrome-extension://${extensionId}/sidepanel/index.html` },
    );
    const panel = await waitFor(
      async () => (await targets()).find((t) => t.id === created.targetId),
      5000,
      "PANEL_READY",
    );
    await waitFor(
      () =>
        evaluate(
          panel,
          "document.readyState==='complete' && !!document.querySelector('#status')",
        ),
      5000,
      "PANEL_LOADED",
    );
    return {
      worker,
      panel,
      extensionId,
      browser: version.Browser,
      pid: child.pid,
      stop,
    };
  } catch (error) {
    await stop();
    throw error;
  }
}
