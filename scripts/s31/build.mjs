import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
await mkdir("dist/s31", { recursive: true });
for (const [name, entry, platform] of [
  ["tasks", "apps/agent-server/src/tasks/index.ts", "node"],
  ["engine", "packages/task-engine/src/durable/index.ts", "browser"],
  ["browser", "packages/browser-runtime/src/index.ts", "browser"],
])
  await build({
    entryPoints: [entry],
    outfile: `dist/s31/${name}.mjs`,
    bundle: true,
    format: "esm",
    platform,
    target: platform === "node" ? "node22" : "chrome116",
  });
console.log("S31 builds PASS; server SQLite adapter requires Node 22.13+");
await build({
  entryPoints: ["scripts/s31/runtime-fixture.ts"],
  outfile: "dist/s31/fixture.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
});
