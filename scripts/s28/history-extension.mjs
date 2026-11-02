import { cp, readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";
export async function prepareHistoryExtension(extension) {
  await cp("dist/s28/chrome-extension", extension, { recursive: true });
  await build({
    entryPoints: ["extension/tests/fixture/s28/history-worker.ts"],
    bundle: true,
    platform: "browser",
    format: "esm",
    outfile: `${extension}/js/service-worker.js`,
  });
  await build({
    entryPoints: ["extension/tests/fixture/s28/history-panel.ts"],
    bundle: true,
    platform: "browser",
    format: "esm",
    outfile: `${extension}/js/history-panel.js`,
    define: {
      __CONTEXTPILOT_DIAGNOSTICS_MODE__: '"release"',
    },
  });
  const htmlPath = `${extension}/sidepanel/index.html`,
    html = await readFile(htmlPath, "utf8");
  await writeFile(
    htmlPath,
    html.replace(
      /<script type="module"[^>]*><\/script>/,
      '<script type="module" src="../js/history-panel.js"></script>',
    ),
  );
}
