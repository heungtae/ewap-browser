import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
export async function buildPackages() {
  for (const name of ["shared", "task-engine", "provider-adapters"]) {
    const source = `packages/${name}`;
    const manifest = JSON.parse(
      await readFile(`${source}/package.json`, "utf8"),
    );
    const output = `dist/s28/packages/${name}`;
    await mkdir(output, { recursive: true });
    const exports = {};
    for (const [key, entry] of Object.entries(manifest.exports)) {
      const stem = key.slice(2);
      const conditions = {};
      for (const platform of name === "shared"
        ? ["browser", "node"]
        : ["node"]) {
        const file = `${stem}.${platform}.mjs`;
        await build({
          entryPoints: [`${source}/${entry}`],
          bundle: true,
          platform,
          format: "esm",
          target: platform === "node" ? "node20" : "chrome116",
          outfile: `${output}/${file}`,
        });
        conditions[platform] = `./${file}`;
      }
      conditions.default = conditions.node;
      exports[key] = conditions;
    }
    await writeFile(
      `${output}/package.json`,
      JSON.stringify(
        {
          name: manifest.name,
          version: manifest.version,
          private: true,
          type: "module",
          exports,
        },
        null,
        2,
      ) + "\n",
    );
  }
}
