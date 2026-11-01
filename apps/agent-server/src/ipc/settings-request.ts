import type { Socket } from "node:net";
import type { ProviderSettingsService } from "../settings/provider-service.js";
export async function requestSettings(
  service: ProviderSettingsService,
  command: unknown,
  deadline: number,
  socket: Socket,
) {
  const controller = new AbortController();
  const stop = () => controller.abort();
  const timer = setTimeout(stop, Math.max(0, deadline - Date.now()));
  timer.unref();
  socket.once("close", stop);
  const guard = () => {
    if (controller.signal.aborted || socket.destroyed || Date.now() >= deadline)
      throw Error("SETTINGS_UNAVAILABLE");
  };
  try {
    guard();
    const result = await service.request(command, guard);
    guard();
    return result;
  } finally {
    clearTimeout(timer);
    socket.removeListener("close", stop);
  }
}
