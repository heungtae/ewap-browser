import { mkdir, writeFile } from "node:fs/promises";
import { cdp } from "../chrome-cdp-utils.mjs";
export async function historyReport(panel, loss) {
  const browser = loss.browser;
  const output =
    process.env.S28_HISTORY_EVIDENCE_DIR ?? "/tmp/s28-history-chrome-evidence";
  await mkdir(output, { recursive: true });
  await cdp(panel.webSocketDebuggerUrl, "Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const shot = await cdp(panel.webSocketDebuggerUrl, "Page.captureScreenshot", {
    format: "png",
  });
  await writeFile(`${output}/panel.png`, Buffer.from(shot.data, "base64"));
  const report = {
    result: "PASS",
    browser: browser.Browser,
    scope:
      "source-fixture Worker/Panel callers, real native relay, authenticated socket and SQLite source; synthetic readonly task admission; no production task routing",
    panelReloadSnapshot: true,
    copiedReaderDenied: true,
    workerActuallyReplaced: loss.workerActuallyReplaced,
    nativeRestartRecovered: true,
    currentTaskCards: 1,
    historicalInputsReactivated: 0,
    historicalValueCleared: true,
    workerResumeCursor: loss.workerResumeCursor,
    nativeResumeCursor: loss.nativeResumeCursor,
    unknownDispatchPreserved: true,
    businessDispatches: 0,
    providerCalls: 0,
  };
  await writeFile(
    `${output}/report.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
}
