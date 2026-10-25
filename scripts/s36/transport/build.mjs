import { build } from "esbuild";
await build({
  entryPoints: ["scripts/s36/transport/entry.ts"],
  outfile: "dist/s36/transport.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
});
console.log(
  "S36 authenticated migration transport fixture bundle built; product/version unchanged",
);
