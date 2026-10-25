if (!process.env.S36_UPGRADE_RELEASE_DIR || !process.env.S36_UPGRADE_RELEASE_ID)
  throw new Error("PINNED_TARGET_RELEASE_REQUIRED");
await import("./chrome.mjs");
