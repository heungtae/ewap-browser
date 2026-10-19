import { lstat, readFile } from "node:fs/promises";
import { z } from "zod";
export const configSchema = z.strictObject({
  installationId: z.string().uuid(),
  profileId: z.string().uuid(),
  extensionIds: z
    .array(z.string().regex(/^[a-p]{32}$/))
    .min(1)
    .max(4),
  secret: z.string().regex(/^[a-f0-9]{64}$/),
  socketPath: z.string().min(1).max(100),
});
export async function readConfig(path: string) {
  const stat = await lstat(path);
  if (
    stat.isSymbolicLink() ||
    !stat.isFile() ||
    stat.uid !== process.getuid?.() ||
    stat.mode & 0o077
  )
    throw new Error("CONFIG_PERMISSIONS");
  return configSchema.parse(JSON.parse(await readFile(path, "utf8")));
}
