import {
  access,
  lstat,
  mkdir,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { isAbsolute, resolve } from "node:path";
export async function install({
  directory,
  extensionId,
  executable,
  dryRun = true,
}) {
  if (process.platform !== "linux") throw new Error("OS_INSTALL_UNQUALIFIED");
  if (!/^[a-p]{32}$/.test(extensionId) || !isAbsolute(executable))
    throw new Error("INSTALL_INPUT");
  await access(executable, constants.X_OK);
  if ((await realpath(executable)) !== (await realpath(process.execPath)))
    throw new Error("WRONG_EXECUTABLE");
  if (Number(process.versions.node.split(".")[0]) < 20)
    throw new Error("NODE_VERSION");
  const plan = {
    directory: resolve(directory),
    host: "ai.contextpilot.agent",
    executable,
    allowed_origins: [`chrome-extension://${extensionId}/`],
    protocol: "wca.bridge/v1",
  };
  if (dryRun) return { ...plan, state: "dry-run", registered: false };
  await mkdir(plan.directory, { recursive: true, mode: 0o700 });
  const directoryStat = await lstat(plan.directory);
  if (
    !directoryStat.isDirectory() ||
    directoryStat.uid !== process.getuid() ||
    directoryStat.mode & 0o077
  )
    throw new Error("INSTALL_PERMISSIONS");
  const configPath = `${plan.directory}/pairing.json`;
  let config;
  try {
    const info = await lstat(configPath);
    if (!info.isFile() || info.uid !== process.getuid() || info.mode & 0o077)
      throw new Error("CONFIG_PERMISSIONS");
    config = JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (!config) {
    config = {
      installationId: randomUUID(),
      profileId: randomUUID(),
      extensionIds: [extensionId],
      secret: randomBytes(32).toString("hex"),
      socketPath: `${plan.directory}/agent.sock`,
    };
    await writeFile(configPath, JSON.stringify(config), {
      mode: 0o600,
      flag: "wx",
    });
  }
  if (
    config.socketPath !== `${plan.directory}/agent.sock` ||
    !/^[a-f0-9]{64}$/.test(config.secret) ||
    !Array.isArray(config.extensionIds) ||
    !config.extensionIds.includes(extensionId)
  )
    throw new Error("PAIRING_IDENTITY_CONFLICT");
  for (const name of ["host.sh", "host-registration.json"]) {
    try {
      const info = await lstat(`${plan.directory}/${name}`);
      if (!info.isFile() || info.uid !== process.getuid() || info.mode & 0o077)
        throw new Error("INSTALL_PERMISSIONS");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const hostPath = `${plan.directory}/host.sh`;
  const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
  await writeFile(
    hostPath,
    `#!/bin/sh\nexec ${quote(executable)} ${quote(resolve("dist/s28/agent-server/launcher.cjs"))} native ${quote(configPath)} "$@"\n`,
    { mode: 0o700 },
  );
  const registration = {
    name: plan.host,
    description: "ContextPilot local agent",
    path: hostPath,
    type: "stdio",
    allowed_origins: plan.allowed_origins,
  };
  await writeFile(
    `${plan.directory}/host-registration.json`,
    JSON.stringify(registration, null, 2),
    { mode: 0o600 },
  );
  return {
    ...plan,
    state: "prepared",
    registered: false,
    configPath,
    instruction:
      "Start launcher daemon with the protected pairing file; explicitly install registration into the selected Chrome profile host registry.",
  };
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [directory, extensionId] = process.argv.slice(2);
  if (!directory || !extensionId)
    throw new Error("Usage: install.mjs DIRECTORY EXTENSION_ID (dry run)");
  console.log(
    JSON.stringify(
      await install({ directory, extensionId, executable: process.execPath }),
      null,
      2,
    ),
  );
}
