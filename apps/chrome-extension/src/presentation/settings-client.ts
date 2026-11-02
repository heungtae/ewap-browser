import {
  settingsResultSchema,
  settingsCommandSchema,
  type SettingsCommand,
  type SettingsView,
  type AgentPreferences,
} from "../../../../packages/shared/src/settings-rpc.js";
export function createSettingsClient(
  request: (command: SettingsCommand) => Promise<unknown>,
) {
  let state: SettingsView | undefined;
  const invoke = async (command: SettingsCommand) => {
    const checked = settingsCommandSchema.safeParse(command);
    if (!checked.success) throw Error("설정 값이 올바르지 않습니다.");
    const decoded = settingsResultSchema.safeParse(await request(checked.data));
    if (!decoded.success)
      throw Error("Backend unavailable — 설정 응답을 확인할 수 없습니다.");
    const result = decoded.data;
    if (!result.ok)
      throw Error(
        result.code === "SETTINGS_STALE"
          ? "다른 창에서 설정이 변경되었습니다. 새로 고침 후 다시 시도하세요."
          : result.code === "SETTINGS_UNAVAILABLE"
            ? "Backend unavailable — 설정 연결을 확인해 주세요."
            : "설정 값과 모델 역할을 확인해 주세요.",
      );
    state = result.state;
    return state;
  };
  const project = (value: SettingsView) => ({
    ok: true,
    providers: value.providers,
    revision: value.revision,
    active_provider: value.roles.analyst ?? undefined,
    primary_configured: !!(
      value.roles.analyst && value.providers[value.roles.analyst]?.enabled
    ),
    routing: {
      mode: value.roles.controllerEnabled ? "jev" : "single",
      decision_provider: value.roles.controller ?? undefined,
      pre_dispatch_failure: "stop",
    },
    effective_mode: value.roles.controllerEnabled ? "jev" : "single",
    secret_mode: value.secretMode,
    controller_ready: value.controllerReady,
    analyst_ready: value.analystReady,
  });
  return {
    read: () => invoke({ kind: "settings.read" }),
    savePreferences: (revision: number, preferences: AgentPreferences) =>
      invoke({ kind: "settings.preferences.write", revision, preferences }),
    async sendMessage(raw: unknown): Promise<Record<string, unknown>> {
      if (!raw || typeof raw !== "object")
        throw Error("설정 요청이 올바르지 않습니다.");
      const message = raw as Record<string, unknown>;
      const payload = message.payload as Record<string, unknown> | undefined;
      if (message.kind === "PROVIDER_LIST")
        return project(await invoke({ kind: "settings.read" }));
      if (message.kind === "PROVIDER_EXPORT") {
        const value = await invoke({ kind: "settings.read" });
        return {
          ok: true,
          export: {
            schema_version: 2,
            providers: value.providers,
            ...(value.roles.analyst
              ? { active_provider: value.roles.analyst }
              : {}),
          },
        };
      }
      if (
        ![
          "PROVIDER_SAVE",
          "PROVIDER_REMOVE",
          "PROVIDER_SET_ACTIVE",
          "PROVIDER_SET_ROUTING",
        ].includes(String(message.kind))
      )
        throw Error("이 설정 기능은 아직 연결되지 않았습니다.");
      if (!state) await invoke({ kind: "settings.read" });
      const revision = payload?.revision;
      if (typeof revision !== "number")
        throw Error("설정 revision이 없습니다. 목록을 새로 고침해 주세요.");
      let command: SettingsCommand;
      if (message.kind === "PROVIDER_SAVE")
        command = {
          kind: "settings.provider.write",
          revision,
          id: payload!.id,
          config: payload!.config,
        } as SettingsCommand;
      else if (message.kind === "PROVIDER_REMOVE")
        command = {
          kind: "settings.provider.remove",
          revision,
          id: payload!.id,
        } as SettingsCommand;
      else if (message.kind === "PROVIDER_SET_ACTIVE")
        command = {
          kind: "settings.roles.write",
          revision,
          roles: { ...state!.roles, analyst: payload!.id as string },
        };
      else if (message.kind === "PROVIDER_SET_ROUTING") {
        const routing = payload!.routing as Record<string, unknown>;
        if (
          !routing ||
          routing.pre_dispatch_failure !== "stop" ||
          !["single", "jev"].includes(String(routing.mode))
        )
          throw Error("Controller 오류 시 작업 중단만 지원합니다.");
        command = {
          kind: "settings.roles.write",
          revision,
          roles: {
            ...state!.roles,
            controller:
              typeof routing.decision_provider === "string"
                ? routing.decision_provider
                : null,
            controllerEnabled: routing.mode === "jev",
          },
        };
      } else throw Error("이 설정 기능은 아직 연결되지 않았습니다.");
      return project(await invoke(command));
    },
  };
}
