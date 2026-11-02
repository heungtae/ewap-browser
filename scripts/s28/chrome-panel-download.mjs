import assert from "node:assert/strict";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { evaluate, waitFor } from "../chrome-cdp-utils.mjs";
export async function qualifyPanelDownload(panel, browser, directory) {
  await mkdir(directory, { recursive: true });
  const socket = new WebSocket(browser.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  try {
    const configured = new Promise((resolve, reject) => {
      socket.addEventListener("message", ({ data }) => {
        const message = JSON.parse(data);
        if (message.id === 1) {
          if (message.error) reject(Error(message.error.message));
          else resolve();
        }
      });
    });
    socket.send(
      JSON.stringify({
        id: 1,
        method: "Browser.setDownloadBehavior",
        params: {
          behavior: "allow",
          downloadPath: directory,
          eventsEnabled: true,
        },
      }),
    );
    await configured;
    await evaluate(
      panel,
      "document.querySelector('#diagnostics-export').click();true",
    );
    const diagnostic = await waitFor(
      async () => {
        try {
          return JSON.parse(
            await readFile(
              `${directory}/contextpilot-presentation-diagnostics.json`,
              "utf8",
            ),
          );
        } catch {
          return undefined;
        }
      },
      5000,
      "PRESENTATION_DIAGNOSTIC_DOWNLOAD",
    ).catch(async (error) => {
      throw Error(
        `${error.message}: files=${JSON.stringify(await readdir(directory))}`,
      );
    });
    assert.equal(diagnostic.scope, "presentation-status-only");
    assert.equal(diagnostic.backendTrace, "unavailable");
    for (const value of [
      "CONTROLLED_VALUE",
      "EXPIRE_ME",
      "guard-document",
      "FIXTURE_PRIVATE_ERROR",
    ])
      assert.equal(JSON.stringify(diagnostic).includes(value), false);
    return {
      actualFile: true,
      scope: "presentation-status-only",
      pendingValuesExcluded: true,
      backendUnavailabilityExplicit: true,
    };
  } finally {
    socket.close();
  }
}
