type StorageArea = {
  get(key: string): Promise<Record<string, unknown>>;
  set(value: Record<string, unknown>): Promise<void>;
};
type BrowserRuntime = {
  sendMessage(message: unknown): Promise<unknown>;
};
type BrowserPermissions = {
  contains(query: { permissions: string[] }): Promise<boolean>;
  request(query: { permissions: string[] }): Promise<boolean>;
  remove(query: { permissions: string[] }): Promise<boolean>;
};
import { validateProfileResolverSettings } from "./profile-settings.js";
const storage = (
  globalThis as typeof globalThis & {
    chrome?: { runtime: BrowserRuntime; storage: { local: StorageArea } };
  }
).chrome?.storage.local;
const runtime = (
  globalThis as typeof globalThis & {
    chrome?: { runtime: BrowserRuntime };
  }
).chrome?.runtime;
const browserPermissions = (
  globalThis as typeof globalThis & {
    chrome?: { permissions?: BrowserPermissions };
  }
).chrome?.permissions;

const form = document.querySelector<HTMLFormElement>("#provider-form");
const status = document.querySelector<HTMLOutputElement>("#settings-status");
const profileForm = document.querySelector<HTMLFormElement>("#profile-form");
const profileStatus =
  document.querySelector<HTMLOutputElement>("#profile-status");
const headersContainer =
  document.querySelector<HTMLElement>("#provider-headers");
const addHeader = document.querySelector<HTMLButtonElement>("#add-header");
const providerTest =
  document.querySelector<HTMLButtonElement>("#provider-test");
const providerTestMessages = document.querySelector<HTMLInputElement>(
  "#provider-test-messages",
);
const providerTestDiagnostics = document.querySelector<HTMLPreElement>(
  "#provider-test-diagnostics",
);
const providerModelsLoad = document.querySelector<HTMLButtonElement>(
  "#provider-models-load",
);
const apiKeyToggle =
  document.querySelector<HTMLButtonElement>("#api-key-toggle");
const providerModels =
  document.querySelector<HTMLDataListElement>("#provider-models");
const providerModelSelectionDialog = document.querySelector<HTMLDialogElement>(
  "#provider-model-selection-dialog",
);
const providerModelSelection = document.querySelector<HTMLSelectElement>(
  "#provider-model-selection",
);
const providerModelSelectionCancel = document.querySelector<HTMLButtonElement>(
  "#provider-model-selection-cancel",
);
const providerModelSelectionConfirm = document.querySelector<HTMLButtonElement>(
  "#provider-model-selection-confirm",
);
const profileTest = document.querySelector<HTMLButtonElement>("#profile-test");
const workflowRecords =
  document.querySelector<HTMLElement>("#workflow-records");
const workflowRecordsStatus = document.querySelector<HTMLOutputElement>(
  "#workflow-records-status",
);
const field = (name: string): HTMLInputElement | HTMLSelectElement => {
  const element = form?.elements.namedItem(name);
  if (
    !(
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement
    )
  )
    throw new Error("settings field missing");
  return element;
};
const show = (message: string): void => {
  if (status) status.value = message;
};

const showTestDiagnostics = (value: unknown): void => {
  if (!providerTestDiagnostics) return;
  if (value === undefined) {
    providerTestDiagnostics.hidden = true;
    providerTestDiagnostics.textContent = "";
    return;
  }
  providerTestDiagnostics.textContent = JSON.stringify(value, null, 2);
  providerTestDiagnostics.hidden = false;
};

const appendHeaderRow = (name = "", value = ""): void => {
  if (!headersContainer) return;
  const row = document.createElement("div");
  row.className = "header-row";
  const nameInput = document.createElement("input");
  nameInput.name = "header_name";
  nameInput.type = "text";
  nameInput.autocomplete = "off";
  nameInput.placeholder = "Header name";
  nameInput.value = name;
  const valueInput = document.createElement("input");
  valueInput.name = "header_value";
  valueInput.type = "password";
  valueInput.autocomplete = "off";
  valueInput.placeholder = "Header value";
  valueInput.value = value;
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "header-value-toggle";
  toggle.textContent = "표시";
  toggle.setAttribute("aria-label", `${name || "header"} value 표시`);
  toggle.addEventListener("click", () => {
    const hidden = valueInput.type === "password";
    valueInput.type = hidden ? "text" : "password";
    toggle.textContent = hidden ? "숨김" : "표시";
    toggle.setAttribute(
      "aria-label",
      `${nameInput.value || "header"} value ${hidden ? "숨김" : "표시"}`,
    );
  });
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "header-remove";
  remove.textContent = "삭제";
  remove.setAttribute("aria-label", `${name || "header"} 삭제`);
  remove.addEventListener("click", () => row.remove());
  row.append(nameInput, valueInput, toggle, remove);
  headersContainer.append(row);
};

const readHeaders = (): Array<{ name: string; value: string }> => {
  if (!headersContainer) return [];
  const result: Array<{ name: string; value: string }> = [];
  for (const row of headersContainer.querySelectorAll<HTMLElement>(
    ".header-row",
  )) {
    const inputs = row.querySelectorAll<HTMLInputElement>("input");
    const name = inputs.item(0).value.trim();
    const value = inputs.item(1).value;
    if (!name && !value) continue;
    if (!name || !value) throw new Error("header key/value missing");
    result.push({ name, value });
  }
  return result;
};

addHeader?.addEventListener("click", () => appendHeaderRow());
appendHeaderRow();
apiKeyToggle?.addEventListener("click", () => {
  const apiKey = field("api_key");
  if (!(apiKey instanceof HTMLInputElement)) return;
  apiKey.type = apiKey.type === "password" ? "text" : "password";
  apiKeyToggle.textContent = apiKey.type === "password" ? "표시" : "숨김";
});
providerModelSelection?.addEventListener("change", () => {
  if (providerModelSelectionConfirm)
    providerModelSelectionConfirm.disabled = !providerModelSelection.value;
});
providerModelSelectionCancel?.addEventListener("click", () => {
  providerModelSelectionDialog?.close();
});
providerModelSelectionConfirm?.addEventListener("click", () => {
  void (async () => {
    const model = providerModelSelection?.value;
    if (!model) return;
    providerModelSelectionConfirm.disabled = true;
    try {
      field("model").value = model;
      await saveProvider();
      providerModelSelectionDialog?.close();
      show(`모델을 선택하고 저장했습니다 (${model})`);
    } catch (error: unknown) {
      show(
        error instanceof Error
          ? `모델 저장 실패 (${error.message})`
          : "모델을 저장하지 못했습니다.",
      );
    } finally {
      providerModelSelectionConfirm.disabled = false;
    }
  })();
});

void storage?.get("provider_settings").then((stored) => {
  const state = stored.provider_settings as
    | { providers?: Record<string, Record<string, unknown>> }
    | undefined;
  const current = state?.providers?.local;
  if (!current) return;
  field("base_url").value = String(current.base_url ?? "");
  field("model").value = String(current.model ?? "");
  field("api_key").value = String(current.api_key ?? "");
  field("api_key_header").value = String(
    current.api_key_header ?? "authorization_bearer",
  );
  if (headersContainer) {
    headersContainer.replaceChildren();
    const headers = Array.isArray(current.headers) ? current.headers : [];
    for (const header of headers) {
      if (
        header &&
        typeof header === "object" &&
        typeof (header as { name?: unknown }).name === "string" &&
        typeof (header as { value?: unknown }).value === "string"
      )
        appendHeaderRow(
          (header as { name: string }).name,
          (header as { value: string }).value,
        );
    }
    if (!headers.length) appendHeaderRow();
  }
  show("저장된 provider 설정을 불러왔습니다. API key는 기본 숨김 상태입니다.");
});

const saveProvider = async (): Promise<{
  wire_api: "chat_completions" | "responses";
  model: string;
  base_url: string;
  api_key_header: string;
  api_key_configured: boolean;
}> => {
  const baseUrl = field("base_url").value.trim();
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error("Endpoint URL 형식을 확인해 주세요.");
  }
  const ollamaEndpoint = parsed.port === "11434";
  const openAiEndpoint = parsed.hostname.toLowerCase() === "api.openai.com";
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
    throw new Error("HTTP 또는 HTTPS endpoint만 허용됩니다.");
  const apiKey = field("api_key").value;
  const apiKeyHeader = field("api_key_header").value;
  let headers: Array<{ name: string; value: string }>;
  try {
    headers = readHeaders();
  } catch {
    throw new Error("HTTP header name과 value를 함께 입력해 주세요.");
  }
  const provider = {
    plugin_id: "contextpilot.openai-compatible",
    plugin_version: "1.0.0",
    label: "Local OpenAI-compatible LLM",
    base_url: baseUrl,
    wire_api: (ollamaEndpoint ? "chat_completions" : "responses") as
      | "chat_completions"
      | "responses",
    model: field("model").value.trim(),
    api_key: apiKey,
    api_key_header: apiKeyHeader,
    headers,
    timeout_ms: 120_000,
    enabled: true,
  };
  if (!storage) throw new Error("설정 저장소를 사용할 수 없습니다.");
  const stored = await storage.get("provider_settings");
  const previous = stored.provider_settings as
    | { providers?: Record<string, Record<string, unknown>> }
    | undefined;
  if (apiKeyHeader !== "none" && !apiKey && previous?.providers?.local?.api_key)
    provider.api_key = String(previous.providers.local.api_key);
  if (apiKeyHeader === "none") provider.api_key = "";
  const previousWireApi = previous?.providers?.local?.wire_api;
  if (
    !ollamaEndpoint &&
    !openAiEndpoint &&
    (previousWireApi === "chat_completions" || previousWireApi === "responses")
  )
    provider.wire_api = previousWireApi;
  await storage.set({
    provider_settings: {
      schema_version: 1,
      providers: { ...(previous?.providers ?? {}), local: provider },
      active_provider: "local",
    },
  });
  field("api_key").value = provider.api_key;
  return {
    wire_api: provider.wire_api,
    model: provider.model,
    base_url: provider.base_url,
    api_key_header: provider.api_key_header,
    api_key_configured: provider.api_key.length > 0,
  };
};

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  void saveProvider()
    .then(() =>
      show("저장했습니다. API key는 다시 표시하거나 export하지 않습니다."),
    )
    .catch((error: unknown) =>
      show(
        error instanceof Error ? error.message : "설정을 저장하지 못했습니다.",
      ),
    );
});

providerTest?.addEventListener("click", () => {
  void (async () => {
    if (!runtime) {
      show("확장 프로그램 런타임에 연결할 수 없습니다.");
      return;
    }
    show("LLM 연결을 테스트하는 중입니다.");
    const includeMessages = providerTestMessages?.checked === true;
    showTestDiagnostics(undefined);
    const startedAt = performance.now();
    console.groupCollapsed("[ContextPilot] LLM 연결 테스트");
    try {
      const provider = await saveProvider();
      console.info("요청 설정", {
        endpoint: provider.base_url,
        model: provider.model,
        wire_api: provider.wire_api,
        auth: provider.api_key_header,
        key_configured: provider.api_key_configured,
        stream: false,
      });
      const response = await runtime.sendMessage({
        kind: "PROVIDER_TEST",
        payload: {
          id: "local",
          request: {
            wire_api: provider.wire_api,
            model: provider.model,
            messages: [{ role: "user", content: "connection test" }],
            stream: false,
          },
          ...(includeMessages ? { include_messages: true } : {}),
        },
      });
      if (
        typeof response === "object" &&
        response !== null &&
        (response as { ok?: unknown }).ok
      ) {
        if (includeMessages)
          showTestDiagnostics(
            (response as { diagnostics?: unknown }).diagnostics,
          );
        console.info("연결 테스트 성공", {
          status: (response as { status?: number }).status,
          elapsed_ms: Math.round(performance.now() - startedAt),
        });
        show(
          `LLM 연결 테스트 성공 (HTTP ${(response as { status?: number }).status ?? "응답"})`,
        );
        return;
      }
      const code =
        typeof response === "object" &&
        response !== null &&
        typeof (response as { code?: unknown }).code === "string"
          ? (response as { code: string }).code
          : "UNKNOWN";
      const detail =
        typeof response === "object" &&
        response !== null &&
        typeof (response as { detail?: unknown }).detail === "string"
          ? `: ${(response as { detail: string }).detail}`
          : "";
      if (includeMessages)
        showTestDiagnostics(
          (response as { diagnostics?: unknown }).diagnostics,
        );
      console.warn("연결 테스트 실패", {
        code,
        detail: detail.slice(2) || undefined,
        elapsed_ms: Math.round(performance.now() - startedAt),
      });
      show(`LLM 연결 테스트 실패 (${code}${detail})`);
    } catch (error: unknown) {
      console.error("연결 테스트 예외", {
        error: error instanceof Error ? error.message : String(error),
        elapsed_ms: Math.round(performance.now() - startedAt),
      });
      show(
        error instanceof Error
          ? `LLM 연결 테스트 실패 (${error.message})`
          : "LLM 연결 테스트에 실패했습니다.",
      );
    } finally {
      console.groupEnd();
    }
  })();
});

providerModelsLoad?.addEventListener("click", () => {
  void (async () => {
    if (!runtime) {
      show("확장 프로그램 런타임에 연결할 수 없습니다.");
      return;
    }
    try {
      await saveProvider();
      show("모델을 불러오는 중입니다.");
      const response = await runtime.sendMessage({
        kind: "PROVIDER_MODELS",
        payload: { id: "local" },
      });
      console.info("모델 조회 응답", response);
      if (
        typeof response === "object" &&
        response !== null &&
        (response as { ok?: unknown }).ok !== true
      ) {
        const code =
          typeof (response as { code?: unknown }).code === "string"
            ? (response as { code: string }).code
            : "UNKNOWN";
        const detail =
          typeof (response as { detail?: unknown }).detail === "string"
            ? `: ${(response as { detail: string }).detail}`
            : "";
        throw new Error(`${code}${detail}`);
      }
      const models =
        typeof response === "object" &&
        response !== null &&
        Array.isArray((response as { models?: unknown }).models)
          ? (response as { models: unknown[] }).models.filter(
              (model): model is string => typeof model === "string",
            )
          : [];
      if (!models.length) throw new Error("모델을 찾지 못했습니다.");
      providerModels?.replaceChildren(
        ...models.map((model) => {
          const option = document.createElement("option");
          option.value = model;
          return option;
        }),
      );
      if (models.length === 1) {
        field("model").value = models[0] ?? "";
        await saveProvider();
        show(`모델 불러오기 완료 (1개: ${models[0]})`);
        return;
      }
      if (providerModelSelection && providerModelSelectionDialog) {
        providerModelSelection.replaceChildren();
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "모델을 선택하세요";
        placeholder.disabled = true;
        placeholder.selected = true;
        providerModelSelection.append(placeholder);
        for (const model of models) {
          const option = document.createElement("option");
          option.value = model;
          option.textContent = model;
          providerModelSelection.append(option);
        }
        if (providerModelSelectionConfirm)
          providerModelSelectionConfirm.disabled = true;
        providerModelSelectionDialog.showModal();
      }
      show(
        `모델 불러오기 완료 (${models.length}개). 팝업에서 모델을 선택하세요.`,
      );
    } catch (error: unknown) {
      show(
        error instanceof Error
          ? `모델 불러오기 실패 (${error.message})`
          : "모델을 불러오지 못했습니다.",
      );
    }
  })();
});

const profileField = (name: string): HTMLInputElement | HTMLTextAreaElement => {
  const element = profileForm?.elements.namedItem(name);
  if (
    !(
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
    )
  )
    throw new Error("profile settings field missing");
  return element;
};
void storage?.get("profile_resolver").then((stored) => {
  const current = stored.profile_resolver as
    | Record<string, unknown>
    | undefined;
  if (!current) return;
  profileField("resolver_url").value = String(current.url ?? "");
  profileField("deployment_id").value = String(current.deployment_id ?? "");
  profileField("allowed_origins").value = Array.isArray(current.allowed_origins)
    ? current.allowed_origins.join("\n")
    : "";
  profileField("key_ring").value = JSON.stringify(
    current.key_ring ?? {},
    null,
    2,
  );
});
const readProfileSettings = () =>
  validateProfileResolverSettings({
    schema_version: 1,
    url: profileField("resolver_url").value.trim(),
    deployment_id: profileField("deployment_id").value.trim(),
    allowed_origins: profileField("allowed_origins")
      .value.split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean),
    key_ring: JSON.parse(profileField("key_ring").value),
  });
const saveProfileSettings = async () => {
  const value = readProfileSettings();
  if (!storage) throw new Error("설정 저장소를 사용할 수 없습니다.");
  await storage.set({ profile_resolver: value });
};

profileForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  void saveProfileSettings()
    .then(() => {
      if (profileStatus)
        profileStatus.value = "Page Profile Resolver 설정을 저장했습니다.";
    })
    .catch(() => {
      if (profileStatus)
        profileStatus.value =
          "Resolver URL, origin, public key 형식을 확인해 주세요.";
    });
});

profileTest?.addEventListener("click", () => {
  void (async () => {
    if (!runtime) {
      if (profileStatus)
        profileStatus.value = "확장 프로그램 런타임에 연결할 수 없습니다.";
      return;
    }
    if (profileStatus)
      profileStatus.value = "Page Profile MCP 연결을 테스트하는 중입니다.";
    try {
      await saveProfileSettings();
      const response = await runtime.sendMessage({ kind: "RESOLVE_PROFILE" });
      if (
        typeof response === "object" &&
        response !== null &&
        (response as { ok?: unknown }).ok
      ) {
        const value = response as {
          resolution?: string;
          profile_id?: string;
          profile_version?: number;
        };
        if (profileStatus)
          profileStatus.value = `Page Profile MCP 연결 테스트 성공 (${value.resolution ?? "응답 검증 완료"}${value.profile_id ? `, ${value.profile_id} v${value.profile_version ?? "-"}` : ""})`;
        return;
      }
      const code =
        typeof response === "object" &&
        response !== null &&
        typeof (response as { code?: unknown }).code === "string"
          ? (response as { code: string }).code
          : "UNKNOWN";
      if (profileStatus)
        profileStatus.value = `Page Profile MCP 연결 테스트 실패 (${code})`;
    } catch {
      if (profileStatus)
        profileStatus.value =
          "Resolver URL, origin, public key 형식 또는 현재 페이지를 확인해 주세요.";
    }
  })();
});

type WorkflowRecordView = {
  id: string;
  title: string;
  enabled: boolean;
  origin: string;
  path_prefix: string;
  updated_at: string;
  declaration: { steps: unknown[] };
};
const updateWorkflowRecord = async (
  operation: "rename" | "set_enabled" | "delete",
  item: WorkflowRecordView,
  title = item.title,
  enabled = item.enabled,
): Promise<void> => {
  const response = await runtime?.sendMessage({
    kind: "WORKFLOW_CATALOG_UPDATE",
    operation,
    id: item.id,
    title,
    enabled,
  });
  if (
    !response ||
    typeof response !== "object" ||
    (response as { ok?: unknown }).ok !== true
  )
    throw new Error("워크플로우를 저장하지 못했습니다.");
  await refreshWorkflowRecords();
};
const renderWorkflowRecords = (items: WorkflowRecordView[]): void => {
  if (!workflowRecords) return;
  workflowRecords.replaceChildren();
  if (items.length === 0) {
    workflowRecords.textContent = "저장된 워크플로우가 없습니다.";
    return;
  }
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "header-row";
    const title = document.createElement("input");
    title.value = item.title;
    title.setAttribute("aria-label", "워크플로우 이름");
    const detail = document.createElement("span");
    detail.textContent = `${item.origin}${item.path_prefix} · ${item.declaration.steps.length}단계`;
    const enabled = document.createElement("input");
    enabled.type = "checkbox";
    enabled.checked = item.enabled;
    enabled.setAttribute("aria-label", `${item.title} 사용`);
    const save = document.createElement("button");
    save.type = "button";
    save.textContent = "이름 저장";
    save.addEventListener(
      "click",
      () => void updateWorkflowRecord("rename", item, title.value.trim()),
    );
    enabled.addEventListener(
      "change",
      () =>
        void updateWorkflowRecord(
          "set_enabled",
          item,
          item.title,
          enabled.checked,
        ),
    );
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "삭제";
    remove.addEventListener(
      "click",
      () => void updateWorkflowRecord("delete", item),
    );
    row.append(title, detail, enabled, save, remove);
    workflowRecords.append(row);
  }
};
const refreshWorkflowRecords = async (): Promise<void> => {
  try {
    const response = await runtime?.sendMessage({
      kind: "WORKFLOW_CATALOG_LIST",
    });
    const records =
      response &&
      typeof response === "object" &&
      (response as { ok?: unknown }).ok === true &&
      Array.isArray((response as { records?: unknown }).records)
        ? (response as { records: WorkflowRecordView[] }).records
        : [];
    renderWorkflowRecords(records);
    if (workflowRecordsStatus) workflowRecordsStatus.value = "";
  } catch {
    if (workflowRecordsStatus)
      workflowRecordsStatus.value = "저장된 워크플로우를 불러오지 못했습니다.";
  }
};
void refreshWorkflowRecords();

const agentPreferencesForm = document.querySelector<HTMLFormElement>(
  "#agent-preferences-form",
);
const agentPreferencesStatus = document.querySelector<HTMLOutputElement>(
  "#agent-preferences-status",
);
const contentRecoveryEnable = document.querySelector<HTMLInputElement>(
  "#content-recovery-enable",
);
const contentRecoveryStatus = document.querySelector<HTMLOutputElement>(
  "#content-recovery-status",
);
const refreshContentRecoveryPermission = async (): Promise<void> => {
  const enabled = await browserPermissions
    ?.contains({ permissions: ["scripting"] })
    .catch(() => false);
  if (contentRecoveryEnable) {
    contentRecoveryEnable.checked = enabled ?? false;
    contentRecoveryEnable.disabled = !browserPermissions;
  }
  if (contentRecoveryStatus)
    contentRecoveryStatus.value = enabled
      ? "자동 복구가 허용되었습니다."
      : "연결이 끊긴 페이지를 새로고침 없이 복구하려면 권한을 허용하세요.";
};
contentRecoveryEnable?.addEventListener("change", () => {
  void (async () => {
    if (!browserPermissions || !contentRecoveryEnable) return;
    contentRecoveryEnable.disabled = true;
    try {
      const changed = contentRecoveryEnable.checked
        ? await browserPermissions.request({ permissions: ["scripting"] })
        : await browserPermissions.remove({ permissions: ["scripting"] });
      if (!changed && contentRecoveryStatus)
        contentRecoveryStatus.value = contentRecoveryEnable.checked
          ? "자동 복구 권한이 허용되지 않았습니다."
          : "자동 복구 권한을 해제하지 못했습니다.";
      await refreshContentRecoveryPermission();
    } catch {
      if (contentRecoveryStatus)
        contentRecoveryStatus.value = "자동 복구 권한을 변경하지 못했습니다.";
      await refreshContentRecoveryPermission();
    }
  })();
});
void refreshContentRecoveryPermission();
const preferenceField = (
  name: string,
): HTMLInputElement | HTMLSelectElement => {
  const element = agentPreferencesForm?.elements.namedItem(name);
  if (
    !(
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement
    )
  )
    throw new Error("agent preference field missing");
  return element;
};
const applyPreferences = (value: unknown): void => {
  if (!value || typeof value !== "object") return;
  const preferences = value as Record<string, unknown>;
  for (const name of [
    "permission_mode",
    "default_read_scope",
    "screenshot_policy",
  ]) {
    const field = preferenceField(name);
    if (typeof preferences[name] === "string") field.value = preferences[name];
  }
  for (const name of ["group_tools_in_timeline", "show_tool_debug_details"]) {
    const field = preferenceField(name);
    if (
      field instanceof HTMLInputElement &&
      typeof preferences[name] === "boolean"
    )
      field.checked = preferences[name];
  }
};
void runtime
  ?.sendMessage({ kind: "AGENT_PREFERENCES_GET" })
  .then((response) => {
    if (
      typeof response === "object" &&
      response !== null &&
      (response as { ok?: unknown }).ok
    )
      applyPreferences((response as { preferences?: unknown }).preferences);
  });
agentPreferencesForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  void (async () => {
    if (!runtime) throw new Error("runtime unavailable");
    const acknowledgement = preferenceField("skip_acknowledgement");
    const response = await runtime.sendMessage({
      kind: "AGENT_PREFERENCES_SAVE",
      payload: {
        preferences: {
          permission_mode: preferenceField("permission_mode").value,
          default_read_scope: preferenceField("default_read_scope").value,
          screenshot_policy: preferenceField("screenshot_policy").value,
          group_tools_in_timeline: (
            preferenceField("group_tools_in_timeline") as HTMLInputElement
          ).checked,
          show_tool_debug_details: (
            preferenceField("show_tool_debug_details") as HTMLInputElement
          ).checked,
        },
        acknowledgement: acknowledgement.value,
      },
    });
    if (
      !(
        typeof response === "object" &&
        response !== null &&
        (response as { ok?: unknown }).ok
      )
    ) {
      const code =
        typeof response === "object" &&
        response !== null &&
        typeof (response as { code?: unknown }).code === "string"
          ? (response as { code: string }).code
          : "UNKNOWN";
      throw new Error(code);
    }
    acknowledgement.value = "";
    applyPreferences((response as { preferences?: unknown }).preferences);
    if (agentPreferencesStatus)
      agentPreferencesStatus.value =
        "Browser Agent 설정을 저장했습니다. 진행 중 run은 취소되었습니다.";
  })().catch((error: unknown) => {
    if (agentPreferencesStatus)
      agentPreferencesStatus.value =
        error instanceof Error && error.message === "INVALID_ARGUMENT"
          ? "권한 질문 생략을 활성화하려면 확인 문구를 정확히 입력하세요."
          : "Browser Agent 설정을 저장하지 못했습니다.";
  });
});
