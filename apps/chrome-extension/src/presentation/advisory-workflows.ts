import type { AdvisoryClient } from "./advisory-client.js";
export function initializeAdvisoryWorkflows(client: AdvisoryClient) {
  const root = document.getElementById("workflow-records"),
    status = document.getElementById("workflow-records-status");
  if (!root || !status) return;
  let cursor: string | null = null,
    sequence = 0;
  const report = (work: Promise<unknown>) => {
    void work.catch((error) => {
      status.textContent =
        error instanceof Error
          ? error.message
          : "워크플로우를 불러오지 못했습니다.";
    });
  };
  const load = async () => {
    status.textContent = "워크플로우를 불러오는 중입니다.";
    const current = ++sequence;
    const page = await client.workflows(cursor);
    if (current !== sequence) return;
    root.replaceChildren();
    if (!page.items.length)
      root.textContent = page.partial
        ? "이 범위에 저장된 워크플로우가 없습니다. 다음 목록을 확인하세요."
        : "저장된 참고 워크플로우가 없습니다.";
    for (const item of page.items) {
      const row = document.createElement("div");
      row.className = "workflow-row";
      const label = document.createElement("label"),
        name = document.createElement("input"),
        detail = document.createElement("p"),
        enabledLabel = document.createElement("label"),
        enabled = document.createElement("input"),
        actions = document.createElement("div");
      label.textContent = "워크플로우 이름";
      name.value = item.name;
      name.required = true;
      name.maxLength = 80;
      label.append(name);
      detail.className = "workflow-detail";
      detail.textContent = `${item.origin} · ${item.stepLabels.length}단계 · 참고용`;
      enabledLabel.className = "checkbox-row";
      enabled.type = "checkbox";
      enabled.checked = item.enabled;
      enabledLabel.append(
        enabled,
        "이 워크플로우를 참고 후보에 포함 (즉시 적용)",
      );
      actions.className = "button-row";
      const save = document.createElement("button"),
        remove = document.createElement("button");
      save.type = remove.type = "button";
      save.textContent = "이름 저장";
      remove.textContent = "삭제";
      remove.className = "danger-button";
      const change = async (operation: "rename" | "enabled" | "delete") => {
        for (const field of row.querySelectorAll<
          HTMLInputElement | HTMLButtonElement
        >("input,button"))
          field.disabled = true;
        try {
          if (operation === "delete")
            await client.change({
              kind: "advisory.delete",
              revision: page.revision,
              scope: item.scope,
              id: item.id,
            });
          else
            await client.change({
              kind: "advisory.update",
              revision: page.revision,
              scope: item.scope,
              id: item.id,
              patch:
                operation === "rename"
                  ? { name: name.value.trim() }
                  : { enabled: enabled.checked },
            });
          await load();
          status.textContent =
            operation === "delete"
              ? "워크플로우를 삭제했습니다."
              : "워크플로우 변경사항을 저장했습니다.";
        } catch (error) {
          enabled.checked = item.enabled;
          throw error;
        } finally {
          for (const field of row.querySelectorAll<
            HTMLInputElement | HTMLButtonElement
          >("input,button"))
            field.disabled = false;
        }
      };
      save.onclick = () => {
        if (!name.value.trim()) {
          name.setCustomValidity("워크플로우 이름을 입력하세요.");
          name.reportValidity();
          return;
        }
        report(change("rename"));
      };
      name.oninput = () => name.setCustomValidity("");
      enabled.onchange = () => report(change("enabled"));
      remove.onclick = () => {
        if (window.confirm(`‘${item.name}’ 참고 워크플로우를 삭제할까요?`))
          report(change("delete"));
      };
      actions.append(save, remove);
      row.append(label, detail, enabledLabel, actions);
      root.append(row);
    }
    if (page.cursor) {
      const next = document.createElement("button");
      next.type = "button";
      next.textContent = "다음 목록";
      next.onclick = () => {
        cursor = page.cursor;
        report(load());
      };
      root.append(next);
    }
    status.textContent =
      "참고 기록입니다. 현재 실행 권한이나 대상은 포함하지 않습니다.";
  };
  document.getElementById("workflow-refresh")!.onclick = () => {
    cursor = null;
    report(load());
  };
  report(load());
}
