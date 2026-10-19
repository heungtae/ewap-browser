import { buildPackages } from "./build-packages.mjs";
import { build as viteBuild } from "vite";
import { build } from "esbuild";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
await buildPackages();
const root = resolve("apps/chrome-extension/.generated");
const output = resolve("dist/s28/chrome-extension");
await rm(root, { recursive: true, force: true });
await mkdir(root, { recursive: true });
await cp("apps/chrome-extension/assets", `${root}/assets`, { recursive: true });
const pages = {
  sidepanel: ["index.html"],
  settings: ["index.html", "learned-profiles.html"],
};
for (const [dir, names] of Object.entries(pages)) {
  await mkdir(`${root}/${dir}`, { recursive: true });
  for (const file of await readdir(`apps/chrome-extension/ui/${dir}`))
    if (file.endsWith(".css"))
      await cp(
        `apps/chrome-extension/ui/${dir}/${file}`,
        `${root}/${dir}/${file}`,
      );
  for (const name of names) {
    let html = await readFile(
      `apps/chrome-extension/ui/${dir}/${name}`,
      "utf8",
    );
    for (const match of html.matchAll(/<!-- include: ([a-z-]+\.html) -->/g))
      html = html.replace(
        match[0],
        await readFile(`apps/chrome-extension/ui/settings/${match[1]}`, "utf8"),
      );
    html = html.replace(/src="\.\.\/js\/[^\"]+\.js"/, 'src="/presentation.ts"');
    await writeFile(`${root}/${dir}/${name}`, html);
  }
}
await writeFile(
  `${root}/presentation.ts`,
  'import "../src/presentation/entry.ts";\n',
);
await viteBuild({
  configFile: false,
  root,
  base: "./",
  logLevel: "warn",
  build: {
    outDir: output,
    emptyOutDir: true,
    target: "chrome116",
    assetsInlineLimit: 0,
    rollupOptions: {
      input: [
        "sidepanel/index.html",
        "settings/index.html",
        "settings/learned-profiles.html",
      ].map((p) => `${root}/${p}`),
    },
  },
});
await cp(`${root}/assets`, `${output}/assets`, { recursive: true });
await cp(
  "extension/managed-storage-schema.json",
  `${output}/managed-storage-schema.json`,
);
const manifest = JSON.parse(await readFile("extension/manifest.json", "utf8"));
manifest.permissions.push("nativeMessaging");
manifest.background.service_worker = "js/service-worker.js";
manifest.content_scripts[0].js = ["js/content.js"];
manifest.side_panel.default_path = "sidepanel/index.html";
manifest.options_ui.page = "settings/index.html";
await writeFile(
  `${output}/manifest.json`,
  JSON.stringify(manifest, null, 2) + "\n",
);
await build({
  entryPoints: {
    "service-worker": "apps/chrome-extension/src/bridge/worker.ts",
    content: "extension/src/content/entry.ts",
  },
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "chrome116",
  outdir: `${output}/js`,
  define: { __CONTEXTPILOT_DIAGNOSTICS_MODE__: '"release"' },
});
await build({
  entryPoints: ["apps/agent-server/src/native/launcher.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  outfile: "dist/s28/agent-server/launcher.cjs",
});
console.log(
  `S28 isolated builds: ${manifest.version}; legacy production entry unchanged`,
);
