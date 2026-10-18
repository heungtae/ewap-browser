import { runtime } from "./settings-browser.js";
type WorkflowRecord = {
  id: string;
  title: string;
  enabled: boolean;
  origin: string;
  path_prefix: string;
  declaration: { steps: unknown[] };
};
export const initializeWorkflowSettings = (): void => {
  const list = document.querySelector<HTMLElement>("#workflow-records");
  const status = document.querySelector<HTMLOutputElement>(
    "#workflow-records-status",
  );
  const reload = document.querySelector<HTMLButtonElement>("#workflow-refresh");
  const show = (message: string) => {
    if (status) status.value = message;
  };
  const send = async (message: Record<string, unknown>) => {
    const response = (await runtime?.sendMessage(message)) as
      | { ok?: boolean; records?: WorkflowRecord[] }
      | undefined;
    if (response?.ok !== true)
      throw new Error("워크플로우 작업에 실패했습니다. 다시 시도해 주세요.");
    return response;
  };
  const update = async (
    row: HTMLElement,
    item: WorkflowRecord,
    operation: string,
    title = item.title,
    enabled = item.enabled,
  ) => {
    for (const control of row.querySelectorAll<
      HTMLInputElement | HTMLButtonElement
    >("input,button"))
      control.disabled = true;
    show("변경사항을 저장하는 중입니다.");
    try {
      await send({
        kind: "WORKFLOW_CATALOG_UPDATE",
        operation,
        id: item.id,
        title,
        enabled,
      });
      await refresh();
      show(
        operation === "delete"
          ? "워크플로우를 삭제했습니다."
          : "워크플로우 변경사항을 저장했습니다.",
      );
    } catch (error: unknown) {
      const checkbox = row.querySelector<HTMLInputElement>(
        'input[type="checkbox"]',
      );
      if (checkbox) checkbox.checked = item.enabled;
      show(
        error instanceof Error
          ? error.message
          : "워크플로우를 저장하지 못했습니다.",
      );
    } finally {
      for (const control of row.querySelectorAll<
        HTMLInputElement | HTMLButtonElement
      >("input,button"))
        control.disabled = false;
    }
  };
  const render = (items: WorkflowRecord[]) => {
    if (!list) return;
    list.replaceChildren();
    if (!items.length) {
      list.textContent =
        "저장된 워크플로우가 없습니다. 사이드패널에서 작업 순서를 저장하면 여기에 표시됩니다.";
      return;
    }
    for (const item of items) {
      const row = document.createElement("div");
      row.className = "workflow-row";
      const label = document.createElement("label");
      label.textContent = "워크플로우 이름";
      const title = document.createElement("input");
      title.value = item.title;
      title.required = true;
      label.append(title);
      const detail = document.createElement("p");
      detail.className = "workflow-detail";
      detail.textContent = `${item.origin}${item.path_prefix} · ${item.declaration.steps.length}단계`;
      const enabledLabel = document.createElement("label");
      enabledLabel.className = "checkbox-row";
      const enabled = document.createElement("input");
      enabled.type = "checkbox";
      enabled.checked = item.enabled;
      enabledLabel.append(enabled, "이 워크플로우 사용 (즉시 적용)");
      const actions = document.createElement("div");
      actions.className = "button-row";
      const save = document.createElement("button");
      save.type = "button";
      save.textContent = "이름 저장";
      save.addEventListener("click", () => {
        if (!title.value.trim()) {
          title.setCustomValidity("워크플로우 이름을 입력하세요.");
          title.reportValidity();
          return;
        }
        void update(row, item, "rename", title.value.trim());
      });
      title.addEventListener("input", () => title.setCustomValidity(""));
      enabled.addEventListener(
        "change",
        () =>
          void update(row, item, "set_enabled", item.title, enabled.checked),
      );
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "danger-button";
      remove.textContent = "삭제";
      remove.addEventListener("click", () => {
        if (window.confirm(`‘${item.title}’ 워크플로우를 삭제할까요?`))
          void update(row, item, "delete");
      });
      actions.append(save, remove);
      row.append(label, detail, enabledLabel, actions);
      list.append(row);
    }
  };
  const refresh = async () => {
    const response = await send({ kind: "WORKFLOW_CATALOG_LIST" });
    if (!Array.isArray(response.records))
      throw new Error("워크플로우 목록을 불러오지 못했습니다.");
    render(response.records);
  };
  const load = () => {
    if (reload) reload.disabled = true;
    void refresh()
      .then(() => show(""))
      .catch(() =>
        show(
          "워크플로우 목록을 불러오지 못했습니다. 목록 새로고침으로 다시 시도하세요.",
        ),
      )
      .finally(() => {
        if (reload) reload.disabled = false;
      });
  };
  reload?.addEventListener("click", load);
  load();
};
