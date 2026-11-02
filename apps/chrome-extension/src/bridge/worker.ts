import "./schema-config.js";
import { settingsCommandSchema } from "../../../../packages/shared/src/settings-rpc.js";
import { parseMigrationCommand } from "../../../../packages/policy-engine/src/migration-rpc.js";
import { migrationProfileGuard } from "../../../../packages/shared/src/migration-rpc.js";
import { api, liveUiSender, unboundBootstrapResult } from "./api.js";
import { PanelOwners, openOwnedPanel } from "./panel-owner.js";
import { managementRequest } from "./advisory.js";
import { NativeBridge } from "./native.js";
const panelOwners = new PanelOwners(api?.runtime.id ?? "");
api?.action.onClicked.addListener((tab) => {
  void openOwnedPanel(panelOwners, tab, api!.sidePanel).catch(() => undefined);
});
api?.tabs.onRemoved.addListener((id) => panelOwners.revoke(id));
api?.tabs.onDetached.addListener((id) => panelOwners.revoke(id));
api?.tabs.onUpdated.addListener((id, change) => {
  if (change.status === "loading" || change.url !== undefined)
    panelOwners.revoke(id);
});
let connection: Promise<NativeBridge> | undefined;
function connect(): Promise<NativeBridge> {
  connection ??= (async () => {
    if (!api) throw new Error("BACKEND_UNAVAILABLE");
    // Out-of-band pairing is session-only and is never returned to presentation.
    const stored = (await api.storage.session.get("s28Pairing")).s28Pairing;
    if (!stored || typeof stored !== "object")
      throw new Error("BACKEND_NOT_PAIRED");
    const p = stored as Record<string, unknown>;
    if (
      typeof p.secret !== "string" ||
      !/^[a-f0-9]{64}$/.test(p.secret) ||
      typeof p.installationId !== "string" ||
      typeof p.profileId !== "string"
    )
      throw new Error("INVALID_PAIRING");
    return new NativeBridge(
      api.runtime.connectNative("ai.contextpilot.agent"),
      {
        installationId: p.installationId,
        profileId: p.profileId,
        secret: p.secret,
        extensionId: api.runtime.id,
      },
      { codebase: p.codebaseReadVersion === 1 },
    );
  })();
  return connection;
}
async function request(value: unknown): Promise<unknown> {
  if (!value || typeof value !== "object") throw new Error("INVALID_REQUEST");
  const command = value as Record<string, unknown>;
  if (typeof command.kind === "string" && command.kind.startsWith("advisory."))
    return managementRequest(command);
  const isMigration =
    typeof command.kind === "string" && command.kind.startsWith("migration.");
  if (
    !isMigration &&
    !(
      typeof command.kind === "string" && command.kind.startsWith("settings.")
    ) &&
    command.kind !== "capabilities" &&
    command.kind !== "resumeEvents"
  )
    throw new Error("UNSUPPORTED_COMMAND");
  let bridge: NativeBridge | undefined;
  try {
    bridge = await connect();
    if (
      typeof command.kind === "string" &&
      command.kind.startsWith("settings.")
    )
      return await bridge.request(settingsCommandSchema.parse(command));
    if (isMigration) {
      const parsed = parseMigrationCommand(command);
      const stored = (await api!.storage.session.get("s28Pairing"))
        .s28Pairing as Record<string, string>;
      if (
        parsed.profileGuard !==
        (await migrationProfileGuard(stored.installationId!, stored.profileId!))
      )
        throw new Error("MIGRATION_PROFILE");
      return await bridge.request(parsed);
    }
    return await bridge.request(
      command.kind === "capabilities"
        ? { kind: "capabilities" }
        : {
            kind: "resumeEvents",
            afterSequence: Number(command.afterSequence),
            ...(typeof command.streamId === "string"
              ? { streamId: command.streamId }
              : {}),
          },
    );
  } catch (error) {
    bridge?.close();
    connection = undefined;
    throw error;
  }
}
api?.runtime.onInstalled.addListener(() => {
  void api!.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
});
api?.runtime.onMessage.addListener((value, sender, reply) => {
  const kind =
    value && typeof value === "object"
      ? (value as Record<string, unknown>).kind
      : undefined;
  const bootstrap = kind === "capabilities" || kind === "resumeEvents";
  void panelOwners
    .resolve(
      sender,
      () => api!.runtime.getContexts({ contextTypes: ["SIDE_PANEL"] }),
      (id) => api!.tabs.get(id),
    )
    .then(
      (owner) =>
        (bootstrap && owner !== null) ||
        liveUiSender(
          api!.runtime.id,
          sender,
          () =>
            api!.runtime.getContexts(
              sender.documentId
                ? { documentIds: [sender.documentId] }
                : { contextTypes: ["SIDE_PANEL"] },
            ),
          bootstrap,
        ),
    )
    .then((trusted) => {
      if (
        typeof kind === "string" &&
        kind.startsWith("advisory.") &&
        !["settings/index.html", "settings/learned-profiles.html"].some(
          (path) =>
            sender.url?.split("#")[0] ===
            `chrome-extension://${api!.runtime.id}/${path}`,
        )
      )
        throw Error("UI_SENDER_DENIED");
      if (
        !trusted ||
        (typeof kind === "string" &&
          kind.startsWith("settings.") &&
          sender.url?.split("#")[0] !==
            `chrome-extension://${api!.runtime.id}/settings/index.html`)
      )
        throw new Error("UI_SENDER_DENIED");
      return request(value);
    })
    .then((result) =>
      reply({
        ok: true,
        result: sender.documentId
          ? result
          : unboundBootstrapResult(kind, result),
      }),
    )
    .catch((error) =>
      reply({
        ok: false,
        error:
          typeof kind === "string" &&
          kind.startsWith("advisory.") &&
          error instanceof Error &&
          [
            "MANAGEMENT_STALE",
            "ADVISORY_UNAVAILABLE",
            "MANAGEMENT_EXPIRED",
          ].includes(error.message)
            ? error.message
            : "BACKEND_UNAVAILABLE",
      }),
    );
  return true;
});
