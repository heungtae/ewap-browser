import { build } from "esbuild";
await build({
  stdin: {
    contents: `export {TaskStore} from './apps/agent-server/src/tasks/store.ts';export {TaskHistoryService} from './apps/agent-server/src/tasks/history-service.ts';export {Session} from './apps/agent-server/src/ipc/session.ts';export {listenLocal,stopLocal} from './apps/agent-server/src/ipc/server.ts';export {FrameDecoder,encodeFrame} from './apps/agent-server/src/native/framing.ts';export {NativeBridge} from './apps/chrome-extension/src/bridge/native.ts';export {createTaskHistoryClient} from './apps/chrome-extension/src/bridge/task-history-client.ts';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: "dist/s28/history.mjs",
});
