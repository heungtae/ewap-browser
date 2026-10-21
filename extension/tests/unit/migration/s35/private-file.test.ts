import { mkdtemp, writeFile, chmod, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { readPrivateJson } from "../../../../../packages/integration-adapters/src/private-file.js";
it("S35 pairing files require a private owned directory, private file and no symlink", async () => {
  const directory = await mkdtemp(join(tmpdir(), "s35-private-"));
  const path = join(directory, "pairing.json");
  try {
    await writeFile(path, JSON.stringify({ fixture: true }), { mode: 0o600 });
    expect(await readPrivateJson(path)).toEqual({ fixture: true });
    await chmod(path, 0o644);
    await expect(readPrivateJson(path)).rejects.toThrow("MCP_PRIVATE_FILE");
    await chmod(path, 0o600);
    await symlink(path, join(directory, "linked.json"));
    await expect(
      readPrivateJson(join(directory, "linked.json")),
    ).rejects.toThrow();
    await chmod(directory, 0o755);
    await expect(readPrivateJson(path)).rejects.toThrow("MCP_PRIVATE_PATH");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
