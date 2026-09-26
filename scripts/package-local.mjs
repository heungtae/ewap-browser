import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  cp,
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  utimes,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import "./release-smoke.mjs";

const manifest = JSON.parse(
  await readFile("dist-extension/manifest.json", "utf8"),
);
if (!/^\d+\.\d+\.\d+$/.test(manifest.version))
  throw new Error("package version is invalid");
const output = resolve(`dist/contextpilot-${manifest.version}.zip`);
const staging = await mkdtemp(join(tmpdir(), "s9-package-"));
const files = [];
const epoch = new Date("1980-01-01T00:00:00Z");
const visit = async (directory, prefix = "") => {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    const relative = `${prefix}${entry.name}`;
    const path = join(directory, entry.name);
    if ((await lstat(path)).isSymbolicLink())
      throw new Error(`package contains symlink: ${relative}`);
    if (entry.isDirectory()) await visit(path, `${relative}/`);
    else {
      await utimes(path, epoch, epoch);
      files.push(relative);
    }
  }
};
try {
  await cp("dist-extension", staging, { recursive: true });
  await visit(staging);
  await mkdir("dist", { recursive: true });
  await rm(output, { force: true });
  await new Promise((resolveDone, reject) => {
    const child = spawn("zip", ["-X", "-D", "-q", output, "-@"], {
      cwd: staging,
    });
    child.stdin.end(files.join("\n") + "\n");
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0 ? resolveDone() : reject(new Error(`zip failed: ${code}`)),
    );
  });
  const hash = createHash("sha256")
    .update(await readFile(output))
    .digest("hex");
  console.log(`local package ${output} sha256=${hash} files=${files.length}`);
} finally {
  await rm(staging, { recursive: true, force: true });
}
