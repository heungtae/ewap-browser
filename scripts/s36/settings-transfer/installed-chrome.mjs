import { isolatedKeyring } from "../secrets/fixture.mjs";
const args = process.argv.slice(2);
if (args.length > 1 || (args.length && args[0] !== "--os-store"))
  throw new Error("USAGE: installed-chrome.mjs [--os-store]");
process.env.S36_INSTALLED_MG01 = "1";
process.env.S36_SETTINGS_MODE = args.length ? "os-store" : "session-only";
let keyring;
try {
  if (args.length) {
    keyring = await isolatedKeyring();
    process.env.DISPLAY = "";
    process.env.WAYLAND_DISPLAY = "";
    process.env.NO_AT_BRIDGE = "1";
    process.env.GTK_USE_PORTAL = "0";
  }
  await import("./chrome.mjs");
} finally {
  await keyring?.close();
}
