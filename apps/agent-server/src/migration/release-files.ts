import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  releaseRoots,
  releaseFileSchema,
  type ReleaseSet,
} from "../../../../packages/shared/src/release-set.js";
export const releaseHash = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
export function releaseFiles(directory: string): ReleaseSet["files"] {
  const root = resolve(directory);
  if (!lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink())
    throw new Error("RELEASE_DIRECTORY");
  const files: ReleaseSet["files"] = [];
  let bytes = 0,
    visited = 0;
  function walk(relative: string, depth: number) {
    if (++visited > 8192 || depth > 24) throw new Error("RELEASE_LIMIT");
    const path = resolve(root, relative),
      info = lstatSync(path);
    if (info.isSymbolicLink()) throw new Error("RELEASE_LINK");
    if (info.isDirectory()) {
      const names = readdirSync(path).sort();
      if (names.length > 4096) throw new Error("RELEASE_LIMIT");
      for (const name of names) walk(`${relative}/${name}`, depth + 1);
    } else {
      if (!info.isFile()) throw new Error("RELEASE_FILE_TYPE");
      if (
        info.size > 64 * 1024 * 1024 ||
        files.length >= 4096 ||
        (bytes += info.size) > 256 * 1024 * 1024
      )
        throw new Error("RELEASE_LIMIT");
      const content = readFileSync(path);
      if (content.length !== info.size) throw new Error("RELEASE_CHANGED");
      files.push(
        releaseFileSchema.parse({
          path: relative,
          bytes: content.length,
          sha256: releaseHash(content),
        }),
      );
    }
  }
  for (const component of releaseRoots) walk(component, 0);
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
export function releaseJson(
  directory: string,
  relative: string,
): Record<string, unknown> {
  return JSON.parse(
    readFileSync(resolve(directory, relative), "utf8"),
  ) as Record<string, unknown>;
}
