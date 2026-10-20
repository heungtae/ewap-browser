import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const packages = [
  "collector",
  "codebase-schema",
  "codebase-builder",
  "codebase-repository",
];
for (const name of packages) {
  const output = `dist/s29/packages/${name}`;
  await mkdir(output, { recursive: true });
  const source = JSON.parse(
    await readFile(`packages/${name}/package.json`, "utf8"),
  );
  for (const platform of ["browser", "node"])
    await build({
      entryPoints: [`packages/${name}/src/index.ts`],
      bundle: true,
      platform,
      format: "esm",
      target: platform === "browser" ? "chrome116" : "node20",
      outfile: `${output}/index.${platform}.mjs`,
    });
  await writeFile(
    `${output}/package.json`,
    JSON.stringify(
      {
        name: source.name,
        version: source.version,
        private: true,
        type: "module",
        exports: {
          ".": {
            browser: "./index.browser.mjs",
            node: "./index.node.mjs",
            default: "./index.node.mjs",
          },
        },
      },
      null,
      2,
    ) + "\n",
  );
}
console.log(
  "S29 browser/Node package builds PASS; no extension version change",
);
