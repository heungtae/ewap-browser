type StorageArea = {
  get(key: string): Promise<Record<string, unknown>>;
  set(value: Record<string, unknown>): Promise<void>;
};
import { validateProfileResolverSettings } from "./profile-settings.js";
const storage = (
  globalThis as typeof globalThis & {
    chrome?: { storage: { local: StorageArea } };
  }
).chrome?.storage.local;

const form = document.querySelector<HTMLFormElement>("#provider-form");
const status = document.querySelector<HTMLOutputElement>("#settings-status");
const profileForm = document.querySelector<HTMLFormElement>("#profile-form");
const profileStatus =
  document.querySelector<HTMLOutputElement>("#profile-status");
const headersContainer =
  document.querySelector<HTMLElement>("#provider-headers");
const addHeader = document.querySelector<HTMLButtonElement>("#add-header");
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
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "삭제";
  remove.setAttribute("aria-label", `${name || "header"} 삭제`);
  remove.addEventListener("click", () => row.remove());
  row.append(nameInput, valueInput, remove);
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

void storage?.get("provider_settings").then((stored) => {
  const state = stored.provider_settings as
    | { providers?: Record<string, Record<string, unknown>> }
    | undefined;
  const current = state?.providers?.local;
  if (!current) return;
  field("base_url").value = String(current.base_url ?? "");
  field("model").value = String(current.model ?? "");
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
  show("저장된 provider 설정을 불러왔습니다. 비밀값은 다시 표시하지 않습니다.");
});

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  const baseUrl = field("base_url").value.trim();
  const parsed = new URL(baseUrl);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
    parsed.hostname,
  );
  if (
    parsed.protocol !== "https:" &&
    !(parsed.protocol === "http:" && loopback)
  ) {
    show("HTTPS 또는 loopback HTTP endpoint만 허용됩니다.");
    return;
  }
  const apiKey = field("api_key").value;
  let headers: Array<{ name: string; value: string }>;
  try {
    headers = readHeaders();
  } catch {
    show("HTTP header name과 value를 함께 입력해 주세요.");
    return;
  }
  const provider = {
    plugin_id: "webbrain.openai-compatible",
    plugin_version: "1.0.0",
    label: "Local OpenAI-compatible LLM",
    base_url: baseUrl,
    wire_api: "responses" as "chat_completions" | "responses",
    model: field("model").value.trim(),
    api_key: apiKey,
    api_key_header: field("api_key_header").value,
    headers,
    timeout_ms: 30_000,
    enabled: true,
  };
  void storage
    ?.get("provider_settings")
    .then((stored) => {
      const previous = stored.provider_settings as
        | { providers?: Record<string, Record<string, unknown>> }
        | undefined;
      if (!apiKey && previous?.providers?.local?.api_key)
        provider.api_key = String(previous.providers.local.api_key);
      const previousWireApi = previous?.providers?.local?.wire_api;
      if (
        previousWireApi === "chat_completions" ||
        previousWireApi === "responses"
      )
        provider.wire_api = previousWireApi;
      return storage.set({
        provider_settings: {
          schema_version: 1,
          providers: { ...(previous?.providers ?? {}), local: provider },
          active_provider: "local",
        },
      });
    })
    .then(() => {
      field("api_key").value = "";
      show("저장했습니다. API key는 다시 표시하거나 export하지 않습니다.");
    })
    .catch(() => show("설정을 저장하지 못했습니다."));
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
profileForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const value = validateProfileResolverSettings({
      schema_version: 1,
      url: profileField("resolver_url").value.trim(),
      deployment_id: profileField("deployment_id").value.trim(),
      allowed_origins: profileField("allowed_origins")
        .value.split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean),
      key_ring: JSON.parse(profileField("key_ring").value),
    });
    void storage?.set({ profile_resolver: value }).then(() => {
      if (profileStatus)
        profileStatus.value = "Page Profile Resolver 설정을 저장했습니다.";
    });
  } catch {
    if (profileStatus)
      profileStatus.value =
        "Resolver URL, origin, public key 형식을 확인해 주세요.";
  }
});
