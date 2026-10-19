import { build } from "esbuild";
import { createHash } from "node:crypto";
export async function loadS27() {
  const result = await build({
    stdin: {
      contents: `export * from './packages/task-engine/src/decisions/index.ts';export * from './packages/provider-adapters/src/jev/index.ts';export * from './extension/tests/fixture/s27-scenarios.ts';`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    metafile: true,
  });
  const module = await import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
  );
  return {
    module,
    metafile: result.metafile,
    protocolSourceDigest: createHash("sha256")
      .update(result.outputFiles[0].text)
      .digest("hex"),
  };
}
