import { connect } from "node:net";
import { FrameDecoder } from "./framing.js";
import { readConfig } from "./config.js";
// Host registration supplies a protected configuration, never page input.
export async function nativeEntry(
  configPath: string,
  origin: string,
): Promise<void> {
  const config = await readConfig(configPath);
  if (!config.extensionIds.some((id) => origin === `chrome-extension://${id}/`))
    throw new Error("ORIGIN_DENIED");
  const socket = connect(config.socketPath);
  const fromChrome = new FrameDecoder();
  const fromServer = new FrameDecoder();
  const close = () => {
    socket.destroy();
    process.stdin.pause();
  };
  process.stdin.on("data", (bytes: Buffer) => {
    try {
      fromChrome.push(bytes);
      if (!socket.write(bytes)) process.stdin.pause();
    } catch {
      close();
    }
  });
  socket.on("drain", () => process.stdin.resume());
  socket.on("data", (bytes) => {
    try {
      fromServer.push(bytes);
      if (!process.stdout.write(bytes)) socket.pause();
    } catch {
      close();
    }
  });
  process.stdout.on("drain", () => socket.resume());
  process.stdin.on("end", close);
  socket.on("error", close);
  socket.on("close", close);
}
