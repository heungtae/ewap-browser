import type { PublicProvider } from "./provider-public-import.js";
export const form = document.querySelector<HTMLFormElement>("#provider-form");
const status = document.querySelector<HTMLOutputElement>("#settings-status");
export const headersContainer =
  document.querySelector<HTMLElement>("#provider-headers");
const addHeader = document.querySelector<HTMLButtonElement>("#add-header");
const apiKeyToggle =
  document.querySelector<HTMLButtonElement>("#api-key-toggle");
export const field = (name: string): HTMLInputElement | HTMLSelectElement => {
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
export const show = (message: string): void => {
  if (status) status.value = message;
};

export const appendHeaderRow = (name = "", value = ""): void => {
  if (!headersContainer) return;
  const row = document.createElement("div");
  row.className = "header-row";
  const nameInput = document.createElement("input");
  nameInput.name = "header_name";
  nameInput.type = "text";
  nameInput.autocomplete = "off";
  nameInput.placeholder = "Header name";
  nameInput.value = name;
  nameInput.setAttribute("aria-label", "HTTP 헤더 이름");
  const valueInput = document.createElement("input");
  valueInput.name = "header_value";
  valueInput.type = "password";
  valueInput.autocomplete = "off";
  valueInput.placeholder = "Header value";
  valueInput.value = value;
  valueInput.setAttribute(
    "aria-label",
    "HTTP 헤더 값 (빈 값은 저장된 값 유지)",
  );
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
  remove.addEventListener("click", () => {
    row.remove();
    form?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  row.append(nameInput, valueInput, toggle, remove);
  headersContainer.append(row);
};

export const readHeaders = (): Array<{ name: string; value: string }> => {
  if (!headersContainer) return [];
  const result: Array<{ name: string; value: string }> = [];
  for (const row of headersContainer.querySelectorAll<HTMLElement>(
    ".header-row",
  )) {
    const inputs = row.querySelectorAll<HTMLInputElement>("input");
    const name = inputs.item(0).value.trim();
    const value = inputs.item(1).value;
    if (!name && !value) continue;
    if (!name) throw new Error("header name missing");
    result.push({ name, value });
  }
  return result;
};

addHeader?.addEventListener("click", () => {
  appendHeaderRow();
  form?.dispatchEvent(new Event("input", { bubbles: true }));
});
appendHeaderRow();
apiKeyToggle?.addEventListener("click", () => {
  const apiKey = field("api_key");
  if (!(apiKey instanceof HTMLInputElement)) return;
  apiKey.type = apiKey.type === "password" ? "text" : "password";
  apiKeyToggle.textContent = apiKey.type === "password" ? "표시" : "숨김";
  apiKeyToggle.setAttribute("aria-pressed", String(apiKey.type === "text"));
});

export const loadProviderForm = (id: string, current: PublicProvider) => {
  field("provider_kind").value = current.kind ?? "openai_compatible";

  (field("enabled") as HTMLInputElement).checked = current.enabled !== false;
  field("provider_id").value = id;
  field("base_url").value = current.base_url;
  field("model").value = current.model;
  field("api_key_header").value = current.api_key_header;
  const optIn = field("private_network_opt_in");
  if (optIn instanceof HTMLInputElement)
    optIn.checked = current.private_network_opt_in === true;
  field("wire_api").value = current.wire_api;
  field("api_key").value = "";
  (field("api_key") as HTMLInputElement).type = "password";
  if (apiKeyToggle) {
    apiKeyToggle.textContent = "표시";
    apiKeyToggle.setAttribute("aria-pressed", "false");
  }
  const keyState = document.querySelector<HTMLElement>("#api-key-state");
  if (keyState)
    keyState.textContent = current.has_api_key
      ? "저장됨. 변경할 때만 새 값을 입력하세요."
      : "새 API key만 입력하세요.";
  headersContainer?.replaceChildren();
  for (const name of current.header_names) appendHeaderRow(name);
  if (!current.header_names.length) appendHeaderRow();
  show(
    "Provider 공개 설정을 불러왔습니다. 저장된 API key와 헤더 값은 표시하지 않습니다.",
  );
};
