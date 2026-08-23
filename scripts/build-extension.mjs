import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
const output = new URL("../dist-extension/", import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await build({
  entryPoints: {
    "service-worker": "extension/src/service-worker/entry.ts",
    content: "extension/src/content/entry.ts",
    panel: "extension/src/sidepanel/entry.ts",
    settings: "extension/src/settings/entry.ts",
    offscreen: "extension/src/offscreen/entry.ts",
  },
  bundle: true,
  format: "esm",
  target: "chrome106",
  outdir: new URL("./js/", output).pathname,
  sourcemap: false,
  minify: false,
});
const manifest = JSON.parse(await readFile("extension/manifest.json", "utf8"));
manifest.background.service_worker = "js/service-worker.js";
manifest.content_scripts[0].js = ["js/content.js"];
manifest.side_panel.default_path = "sidepanel/index.html";
manifest.options_ui.page = "settings/index.html";
await writeFile(
  new URL("manifest.json", output),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
await cp("extension/assets", new URL("assets/", output), { recursive: true });
await mkdir(new URL("sidepanel/", output), { recursive: true });
await cp(
  "extension/src/sidepanel/index.html",
  new URL("sidepanel/index.html", output),
);
await mkdir(new URL("settings/", output), { recursive: true });
await cp(
  "extension/src/settings/index.html",
  new URL("settings/index.html", output),
);
await mkdir(new URL("offscreen/", output), { recursive: true });
await cp(
  "extension/src/offscreen/index.html",
  new URL("offscreen/index.html", output),
);
console.log("extension artifact built at dist-extension");
