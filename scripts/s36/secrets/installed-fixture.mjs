import { spawn } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { secretPackage } from "./package-fixture.mjs";
import {
  captureReleaseSet,
  releaseSetId,
} from "../../../dist/s36/release-set.mjs";
import { installRelease } from "../../../dist/s36/installation.mjs";
import {
  NativeBridge,
  FrameDecoder,
  encodeFrame,
  migrationTransport,
  migrationProfileGuard,
} from "../../../dist/s36/transport.mjs";
import { waitFor } from "../../chrome-cdp-utils.mjs";
export function installedFixture() {
  const packages = [secretPackage(), secretPackage()];
  packages.forEach((pkg, index) => {
    copyFileSync(
      "dist/s28/agent-server/launcher.cjs",
      `${pkg.root}/agent-server/launcher.cjs`,
    );
    pkg.write(
      "agent-server/qualification-label.txt",
      `controlled set ${index}`,
    );
    pkg.manifest = captureReleaseSet(pkg.root, pkg.manifest.source);
    pkg.id = releaseSetId(pkg.manifest);
    pkg.write("release-set.json", pkg.manifest);
  });
  const directory = mkdtempSync(`${tmpdir()}/s36-installed-start-`),
    pkg = packages[0];
  const input = {
    directory: `${directory}/agent`,
    registry: `${directory}/registry`,
    releaseDirectory: pkg.root,
    releaseId: pkg.id,
    extensionId: "a".repeat(32),
  };
  installRelease(input);
  let daemon, closed;
  return {
    input,
    packages,
    directory,
    command(pkg = packages[0], mode = "--settings-session-only") {
      return [
        pkg.daemon,
        pkg.id,
        `${input.directory}/pairing.json`,
        mode,
        "--installed",
      ];
    },
    async start(pkg = packages[0], mode) {
      daemon = spawn(process.execPath, this.command(pkg, mode), {
        stdio: "ignore",
      });
      closed = new Promise((resolve) => daemon.once("close", resolve));
      const { existsSync } = await import("node:fs");
      await waitFor(
        () => existsSync(`${input.directory}/agent.sock`),
        3000,
        "INSTALLED_SOCKET",
      );
    },
    async stop() {
      if (!daemon) return;
      daemon.kill("SIGTERM");
      await closed;
      daemon = undefined;
    },
    async status() {
      const config = JSON.parse(
        readFileSync(`${input.directory}/pairing.json`, "utf8"),
      );
      const child = spawn(
        `${input.directory}/host.sh`,
        [`chrome-extension://${input.extensionId}/`],
        { stdio: ["pipe", "pipe", "ignore"] },
      );
      const done = new Promise((resolve) => child.once("close", resolve));
      const messages = [],
        disconnects = [],
        decoder = new FrameDecoder();
      child.stdout.on("data", (data) => {
        for (const value of decoder.push(data))
          for (const fn of messages) fn(value);
      });
      child.once("close", () => disconnects.forEach((fn) => fn()));
      const bridge = new NativeBridge(
        {
          postMessage: (value) => child.stdin.write(encodeFrame(value)),
          disconnect: () => child.kill("SIGTERM"),
          onMessage: { addListener: (fn) => messages.push(fn) },
          onDisconnect: { addListener: (fn) => disconnects.push(fn) },
        },
        { ...config, extensionId: input.extensionId },
      );
      try {
        const profile = await migrationProfileGuard(
          config.installationId,
          config.profileId,
        );
        return await migrationTransport(profile, (value) =>
          bridge.request(value),
        ).status();
      } finally {
        child.kill("SIGTERM");
        await done;
      }
    },
    async close() {
      await this.stop();
      packages.forEach((pkg) => pkg.close());
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
