import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
await mkdir("dist/s32", { recursive: true });
for (const [name, entry, platform] of [
  ["collector", "packages/collector/src/advanced/index.ts", "browser"],
  ["broker", "packages/browser-runtime/src/index.ts", "node"],
  [
    "tools",
    "apps/chrome-extension/src/collectors/advanced-tools.ts",
    "browser",
  ],
  ["setup", "extension/tests/fixture/s30/setup.ts", "node"],
])
  await build({
    entryPoints: [entry],
    outfile: `dist/s32/${name}.mjs`,
    bundle: true,
    platform,
    format: "esm",
    target: platform === "node" ? "node20" : "chrome116",
  });
console.log(
  "S32 isolated collector/broker/tool builds PASS; no version change",
);
