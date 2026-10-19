import { api } from "./api.js";
import { NativeBridge } from "./native.js";
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
    );
  })();
  return connection;
}
async function request(value: unknown): Promise<unknown> {
  if (!value || typeof value !== "object") throw new Error("INVALID_REQUEST");
  const command = value as Record<string, unknown>;
  if (command.kind !== "capabilities" && command.kind !== "resumeEvents")
    throw new Error("UNSUPPORTED_COMMAND");
  let bridge: NativeBridge | undefined;
  try {
    bridge = await connect();
    return await bridge.request(
      command.kind === "capabilities"
        ? { kind: "capabilities" }
        : {
            kind: "resumeEvents",
            afterSequence: Number(command.afterSequence),
          },
    );
  } catch (error) {
    bridge?.close();
    connection = undefined;
    throw error;
  }
}
api?.runtime.onInstalled.addListener(() => {
  void api!.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});
api?.runtime.onMessage.addListener((value, sender, reply) => {
  const paths = [
    "sidepanel/index.html",
    "settings/index.html",
    "settings/learned-profiles.html",
  ];
  if (
    sender.id !== api!.runtime.id ||
    !paths.some(
      (p) =>
        sender.url?.split("#")[0] ===
        `chrome-extension://${api!.runtime.id}/${p}`,
    )
  )
    return false;
  void request(value)
    .then((result) => reply({ ok: true, result }))
    .catch(() => reply({ ok: false, error: "BACKEND_UNAVAILABLE" }));
  return true;
});
