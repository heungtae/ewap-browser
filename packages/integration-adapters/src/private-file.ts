import { constants } from "node:fs";
import { open, lstat } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";
export async function privateDirectory(path: string): Promise<void> {
  if (process.platform === "win32") throw new Error("WINDOWS_ACL_UNQUALIFIED");
  if (!isAbsolute(path)) throw new Error("MCP_PRIVATE_PATH");
  const info = await lstat(path);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    info.uid !== process.getuid?.() ||
    info.mode & 0o077
  )
    throw new Error("MCP_PRIVATE_PATH");
}
export async function readPrivateJson(path: string): Promise<unknown> {
  await privateDirectory(dirname(path));
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await file.stat();
    if (
      !info.isFile() ||
      info.uid !== process.getuid?.() ||
      info.mode & 0o077 ||
      info.size > 32768
    )
      throw new Error("MCP_PRIVATE_FILE");
    return JSON.parse(await file.readFile("utf8"));
  } finally {
    await file.close();
  }
}
