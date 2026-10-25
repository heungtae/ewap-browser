import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, realpathSync } from "node:fs";
import { isAbsolute } from "node:path";
import { z } from "zod";
import type { SecretStore } from "./service.js";
const responseSchema = z.union([
  z.strictObject({ ok: z.literal(true) }),
  z.strictObject({
    ok: z.literal(true),
    value: z.string().max(65536).nullable(),
  }),
]);
export class LinuxSecretServiceStore implements SecretStore {
  readonly mode = "os-store" as const;
  private constructor(
    private readonly helper: string,
    private readonly profile: string,
  ) {}
  static async connect(helper: string, profileGuard: string) {
    if (
      process.platform !== "linux" ||
      !isAbsolute(helper) ||
      realpathSync(helper) !== helper ||
      !/^[a-f0-9]{64}$/.test(profileGuard)
    )
      throw new Error("OS_SECRET_CONFIGURATION");
    const info = lstatSync(helper);
    if (
      !info.isFile() ||
      info.mode & 0o022 ||
      ![0, process.getuid?.()].includes(info.uid)
    )
      throw new Error("OS_SECRET_CONFIGURATION");
    const store = new LinuxSecretServiceStore(helper, profileGuard);
    await store.call("probe");
    return store;
  }
  private async call(
    operation: "probe" | "read" | "write",
    identity?: string,
    value?: string,
  ) {
    if (
      identity !== undefined &&
      (!identity || Buffer.byteLength(identity) > 16384)
    )
      throw new Error("OS_SECRET_IDENTITY");
    if (
      value !== undefined &&
      (Buffer.byteLength(value) > 65536 || value.includes("\0"))
    )
      throw new Error("OS_SECRET_VALUE");
    const body = JSON.stringify({
      operation,
      profile: this.profile,
      ...(identity === undefined
        ? {}
        : { identity: createHash("sha256").update(identity).digest("hex") }),
      ...(value === undefined ? {} : { value }),
    });
    if (Buffer.byteLength(body) > 131072) throw new Error("OS_SECRET_VALUE");
    const environment: NodeJS.ProcessEnv = {
      LANG: "C.UTF-8",
      PATH: "/usr/bin:/bin",
    };
    for (const key of [
      "DBUS_SESSION_BUS_ADDRESS",
      "XDG_RUNTIME_DIR",
      "XDG_DATA_HOME",
      "XDG_CONFIG_HOME",
    ])
      if (process.env[key] !== undefined) environment[key] = process.env[key];
    const output = await new Promise<string>((resolve, reject) => {
      const child = execFile(
        "/usr/bin/python3",
        ["-I", this.helper],
        {
          timeout: 5000,
          maxBuffer: 128 * 1024,
          encoding: "utf8",
          env: environment,
        },
        (error, stdout) => {
          if (error) reject(new Error("OS_SECRET_UNAVAILABLE"));
          else resolve(stdout);
        },
      );
      child.stdin?.on("error", () => undefined);
      child.stdin?.end(body);
    });
    try {
      const result = responseSchema.parse(JSON.parse(output));
      if ((operation === "read") !== "value" in result)
        throw new Error("OS_SECRET_UNAVAILABLE");
      return result;
    } catch {
      throw new Error("OS_SECRET_UNAVAILABLE");
    }
  }
  async read(identity: string) {
    const result = await this.call("read", identity);
    if (!("value" in result)) throw new Error("OS_SECRET_UNAVAILABLE");
    return result.value ?? undefined;
  }
  async write(identity: string, value: string) {
    await this.call("write", identity, value);
  }
}
