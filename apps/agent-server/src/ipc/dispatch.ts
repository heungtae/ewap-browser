import type { Socket } from "node:net";
import type { MigrationRequestContext } from "../../../../packages/shared/src/migration-rpc.js";
import type { ProviderSettingsService } from "../settings/provider-service.js";
import type { ProjectionChannel } from "../codebase/projection-channel.js";
import type { Session } from "./session.js";
import type { EventReplay } from "./replay.js";
import type { ConnectionTransfers } from "./transfers.js";
import { requestSettings } from "./settings-request.js";
import { capabilityHealth } from "../settings/health.js";
export type MigrationHandler = ((
  command: unknown,
  context: MigrationRequestContext,
) => Promise<unknown>) & { settingsMode?: "session-only" | "os-store" };
export interface IpcServices {
  socket: Socket;
  session: Session;
  replay: EventReplay;
  transfers: ConnectionTransfers;
  migration: MigrationHandler | undefined;
  settings: ProviderSettingsService | undefined;
  codebase: ProjectionChannel | undefined;
}
export async function dispatchCommand(
  command: ReturnType<Session["accept"]>,
  s: IpcServices,
): Promise<unknown> {
  const { session, socket } = s;
  if (command.kind.startsWith("codebase.")) {
    if (!s.codebase) throw Error("PROJECTION_UNAVAILABLE");
    return s.codebase.command(command);
  }
  if (command.kind.startsWith("migration.")) {
    if (!s.migration) throw Error("MIGRATION_UNAVAILABLE");
    const abort = new AbortController(),
      disconnect = () => abort.abort();
    const timer = setTimeout(
      disconnect,
      Math.max(0, session.deadline - Date.now()),
    );
    timer.unref();
    socket.once("close", disconnect);
    try {
      const result = await s.migration(command, {
        deadline: session.deadline,
        signal: abort.signal,
      });
      if (
        abort.signal.aborted ||
        Date.now() >= session.deadline ||
        socket.destroyed
      )
        throw Error("MIGRATION_EXPIRED");
      return result;
    } finally {
      clearTimeout(timer);
      socket.removeListener("close", disconnect);
    }
  }
  if (command.kind.startsWith("settings.")) {
    if (!s.settings) throw Error("SETTINGS_UNAVAILABLE");
    return requestSettings(s.settings, command, session.deadline, socket);
  }
  if (command.kind.startsWith("transfer."))
    return s.transfers.handle(command, Date.now());
  if (command.kind === "resumeEvents")
    return s.replay.resume(command.afterSequence, command.streamId);
  if (command.kind === "capabilities")
    return {
      taskReady: false,
      browserReady: session.browserAvailable(),
      health: capabilityHealth({
        hostInstalled: true,
        executableValid: true,
        protocolMajor: 1,
        paired: true,
        durableSecrets: false,
      }),
    };
  if (command.kind === "heartbeat") return { kind: "heartbeat" };
  if (command.kind === "browser.disconnected") s.codebase?.suspend();
  return s.replay.append(
    session.browserAvailable() ? "browser.connected" : "browser.waiting",
  );
}
