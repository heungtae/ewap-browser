import { lstat, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import {
  settingsStateSchema,
  type SettingsPersistence,
  type SettingsState,
} from "./provider-state.js";
export class FileSettingsPersistence implements SettingsPersistence {
  constructor(
    private path: string,
    private scope: { installationId: string; profileId: string },
  ) {
    this.scope = {
      installationId: scope.installationId,
      profileId: scope.profileId,
    };
  }
  private async directory() {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const info = await lstat(dirname(this.path));
    if (
      !info.isDirectory() ||
      info.uid !== process.getuid?.() ||
      info.mode & 0o077
    )
      throw Error("SETTINGS_UNAVAILABLE");
  }
  async read(): Promise<SettingsState> {
    await this.directory();
    try {
      const info = await lstat(this.path);
      if (
        !info.isFile() ||
        info.uid !== process.getuid?.() ||
        info.mode & 0o077 ||
        info.size > 128 * 1024
      )
        throw Error("SETTINGS_UNAVAILABLE");
      const value = settingsStateSchema.parse(
        JSON.parse(await readFile(this.path, "utf8")),
      );
      if (
        value.installationId !== this.scope.installationId ||
        value.profileId !== this.scope.profileId
      )
        throw Error("SETTINGS_UNAVAILABLE");
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return {
        schema: "wca.settings/v1",
        ...this.scope,
        revision: 0,
        roles: { controller: null, analyst: null, controllerEnabled: false },
        providers: {},
      };
    }
  }
  async write(value: SettingsState, expected: number, guard: () => void) {
    const parsed = settingsStateSchema.parse(value);
    if (
      parsed.installationId !== this.scope.installationId ||
      parsed.profileId !== this.scope.profileId ||
      parsed.revision !== expected + 1
    )
      throw Error("SETTINGS_INVALID");
    await this.directory();
    if ((await this.read()).revision !== expected)
      throw Error("SETTINGS_STALE");
    const encoded = JSON.stringify(parsed) + "\n";
    if (Buffer.byteLength(encoded) > 128 * 1024)
      throw Error("SETTINGS_INVALID");
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    const file = await open(temporary, "wx", 0o600);
    try {
      await file.writeFile(encoded);
      await file.sync();
      await file.close();
      guard();
      if ((await this.read()).revision !== expected)
        throw Error("SETTINGS_STALE");
      guard();
      await rename(temporary, this.path);
      const directory = await open(dirname(this.path), "r");
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    } finally {
      await file.close().catch(() => undefined);
      await unlink(temporary).catch(() => undefined);
    }
  }
}
