import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cdp, evaluate, waitFor } from "./chrome-cdp-utils.mjs";
export const checkOptionsViewports = async (settings, checks) => {
  // Validate widths using the actual rendered UI, including all settings groups.
  for (const width of [1440, 390]) {
    await cdp(
      settings.webSocketDebuggerUrl,
      "Emulation.setDeviceMetricsOverride",
      { width, height: 1000, deviceScaleFactor: 1, mobile: false },
    );
    for (const page of ["models", "agent", "automation", "enterprise"]) {
      await evaluate(settings, `location.hash=${JSON.stringify(page)}`);
      await waitFor(
        () =>
          evaluate(
            settings,
            `!document.getElementById(${JSON.stringify(page)}).hidden`,
          ),
        5000,
        "PAGE_VISIBLE",
      );
      assert.equal(
        await evaluate(
          settings,
          "document.documentElement.scrollWidth<=innerWidth",
        ),
        true,
        `${page} overflow at ${width}`,
      );
      if (process.env.OPTIONS_SCREENSHOT_DIR) {
        await writeFile(
          join(
            process.env.OPTIONS_SCREENSHOT_DIR,
            `options-${page}-${width}-2026-10-18.png`,
          ),
          Buffer.from(
            (
              await cdp(
                settings.webSocketDebuggerUrl,
                "Page.captureScreenshot",
                { format: "png" },
              )
            ).data,
            "base64",
          ),
        );
      }
    }
  }
  checks.push(
    "all four pages render without horizontal overflow at 1440px and 390px",
  );
};
