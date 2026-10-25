process.env.S36_BROWSER_RESTART = "1";
process.env.S36_INSTALLED_ALL = "1";
process.env.S36_INSTALLED_JOINT = "1";
await import("./installed-chrome.mjs");
