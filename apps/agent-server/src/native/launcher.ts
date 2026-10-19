import { nativeEntry } from "./entry.js";
import { readConfig } from "./config.js";
import { listenLocal, stopLocal } from "../ipc/server.js";
const [mode, configPath, origin] = process.argv.slice(2);
if (!configPath || !["daemon", "native"].includes(mode ?? ""))
  throw new Error("Usage: launcher daemon|native CONFIG [ORIGIN]");
if (mode === "native") {
  if (!origin) throw new Error("ORIGIN_REQUIRED");
  void nativeEntry(configPath, origin).catch(() => {
    process.exitCode = 1;
  });
} else {
  void readConfig(configPath)
    .then((config) => listenLocal(config.socketPath, config))
    .then((server) => {
      let stopping = false;
      const stop = () => {
        if (stopping) return;
        stopping = true;
        void stopLocal(server).catch(() => {
          process.exitCode = 1;
        });
      };
      process.on("SIGTERM", stop);
      process.on("SIGINT", stop);
    })
    .catch(() => {
      process.exitCode = 1;
    });
}
