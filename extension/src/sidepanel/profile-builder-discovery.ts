import type { DiscoveryResult } from "../page-api/discovery/discovery-types.js";

type Dependencies = {
  dialog: HTMLDialogElement;
  openButton: HTMLButtonElement;
  scanButton: HTMLButtonElement;
  stopButton: HTMLButtonElement;
  closeButton: HTMLButtonElement;
  summary: HTMLElement;
  candidates: HTMLElement;
  send(payload: {
    kind: "PAGE_API_DISCOVERY_START" | "PAGE_API_DISCOVERY_STOP";
  }): Promise<Record<string, unknown>>;
  status(message: string): void;
  canScan(): boolean;
};

const isResult = (value: unknown): value is DiscoveryResult => {
  if (typeof value !== "object" || value === null) return false;
  const result = value as Partial<DiscoveryResult>;
  return (
    [
      "COMPLETED",
      "CANCELLED",
      "STALE",
      "MAIN_UNRESPONSIVE",
      "POLICY_DENIED",
    ].includes(result.terminal ?? "") &&
    typeof result.truncated === "boolean" &&
    Array.isArray(result.candidates) &&
    result.candidates.length <= 96
  );
};

const candidateLabel = (kind: string): string =>
  kind === "public_js_function_hint" ? "공개 함수 힌트" : "인라인 요청 힌트";

export const createProfileBuilderDiscovery = (dependencies: Dependencies) => {
  const {
    dialog,
    openButton,
    scanButton,
    stopButton,
    closeButton,
    summary,
    candidates,
  } = dependencies;
  let generation = 0;
  let scanning = false;
  let stopping = false;

  const updateControls = (): void => {
    scanButton.disabled = scanning || stopping;
    stopButton.disabled = !scanning;
  };

  const invalidate = (message?: string, cancel = true): void => {
    generation += 1;
    candidates.replaceChildren();
    if (scanning && cancel) {
      stopping = true;
      void dependencies
        .send({ kind: "PAGE_API_DISCOVERY_STOP" })
        .catch(() => undefined)
        .finally(() => {
          stopping = false;
          updateControls();
        });
    }
    scanning = false;
    updateControls();
    summary.textContent =
      message ?? "검색을 시작하면 현재 페이지의 비실행 힌트만 표시합니다.";
  };

  const render = (result: DiscoveryResult): void => {
    if (result.terminal !== "COMPLETED") {
      summary.textContent = `검색 결과를 사용할 수 없습니다: ${result.terminal}`;
      return;
    }
    summary.textContent = result.candidates.length
      ? `${result.candidates.length}개의 비실행 힌트가 있습니다. adapter 검토가 필요합니다.`
      : "공개 힌트를 찾지 못했습니다. API 부재의 증거는 아닙니다.";
    for (const [index, candidate] of result.candidates.entries()) {
      if (
        typeof candidate !== "object" ||
        candidate === null ||
        (candidate.kind !== "public_js_function_hint" &&
          candidate.kind !== "script_endpoint_hint") ||
        (candidate.confidence !== "low" && candidate.confidence !== "medium")
      )
        continue;
      const item = document.createElement("li");
      const heading = document.createElement("strong");
      heading.textContent = `${candidateLabel(candidate.kind)} ${index + 1}`;
      const detail = document.createElement("p");
      detail.textContent = `신뢰도: ${candidate.confidence === "medium" ? "보통" : "낮음"} · 페이지 제공 정보 · 실행하지 않음 · adapter 검토 필요`;
      const limitation = document.createElement("p");
      limitation.textContent =
        "제약: 페이지 정보는 검증되지 않았으며 외부 스크립트와 실제 API 계약은 확인하지 않았습니다.";
      const mark = document.createElement("button");
      mark.type = "button";
      mark.textContent = "adapter 검토 필요";
      mark.addEventListener("click", () => {
        mark.disabled = true;
        mark.textContent = "검토 필요로 표시됨";
      });
      item.append(heading, detail, limitation, mark);
      candidates.append(item);
    }
    if (result.truncated) summary.textContent += " 일부 힌트만 관찰했습니다.";
  };

  openButton.addEventListener("click", () => {
    if (dialog.open || !dependencies.canScan()) return;
    invalidate();
    dialog.showModal();
  });
  scanButton.addEventListener("click", () => {
    if (scanning || stopping) return;
    if (!dependencies.canScan()) {
      summary.textContent = "진행 중인 작업을 마친 뒤 검색해 주세요.";
      return;
    }
    invalidate("현재 페이지의 공개 힌트를 확인하고 있습니다.");
    const current = generation;
    scanning = true;
    updateControls();
    void dependencies
      .send({ kind: "PAGE_API_DISCOVERY_START" })
      .then((response) => {
        if (current !== generation || !dialog.open) return;
        if (!isResult(response.result)) throw new Error("INTERNAL_FAILURE");
        render(response.result);
        dependencies.status("Page API 힌트 검색을 마쳤습니다.");
      })
      .catch((error: unknown) => {
        if (current !== generation || !dialog.open) return;
        summary.textContent =
          "검색에 실패했습니다. 현재 페이지에서 다시 시도해 주세요.";
        dependencies.status(
          error instanceof Error ? error.message : "INTERNAL_FAILURE",
        );
      })
      .finally(() => {
        if (current !== generation) return;
        scanning = false;
        updateControls();
      });
  });
  stopButton.addEventListener("click", () =>
    invalidate("검색을 중단했습니다."),
  );
  closeButton.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => invalidate());
  updateControls();
  return {
    invalidate,
    close: (cancel = true) => {
      if (!cancel) invalidate(undefined, false);
      if (dialog.open) dialog.close();
      else if (cancel) invalidate();
    },
  };
};
