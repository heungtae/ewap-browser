import { build } from "esbuild";
for (const [name, entry] of [
  ["gateway", "scripts/s35/gateway-entry.ts"],
  ["fixtures", "scripts/s35/backend-entry.ts"],
])
  await build({
    entryPoints: [entry],
    outfile: `dist/s35/${name}.mjs`,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    banner: {
      js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
    },
  });
console.log(
  "S35 isolated gateway/backend fixture builds PASS; product/version unchanged",
);
