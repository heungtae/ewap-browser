import type { ActivityStage } from "../contracts/chat-event-types.js";
import { readDiagnostics, type DiagnosticsPage } from "./diagnostics-client.js";
type Reply = Record<string, unknown>;
export const createDiagnosticsView = (options: {
  send(value: unknown): Promise<Reply>;
  current(): Reply | undefined;
  status(text: string): void;
  activity(text?: string): void;
  active(): boolean;
  label(stage: ActivityStage): string;
  version(): string;
  failure(code?: string): void;
}) => {
  const executionDetails =
    document.querySelector<HTMLDetailsElement>("#execution-details");
  const executionTrace =
    document.querySelector<HTMLPreElement>("#execution-trace");
  const diagnosticsDebug =
    document.querySelector<HTMLButtonElement>("#diagnostics-debug");
  const sendRuntime = options.send;
  const setStatus = options.status;
  const setActivityStatus = options.activity;
  const showFailure = options.failure;
  const activityLabel = options.label;
  const renderExecutionTrace = (
    request: Record<string, unknown>,
    diagnostics: DiagnosticsPage,
  ): void => {
    if (!executionDetails || !executionTrace) return;
    executionDetails.hidden = false;
    if (diagnosticsDebug) {
      diagnosticsDebug.dataset.level = diagnostics.level;
      diagnosticsDebug.textContent =
        diagnostics.level === "debug"
          ? "개발 추적 끄기 (30분 자동 해제)"
          : "개발 추적 켜기";
    }
    const state = typeof request.state === "string" ? request.state : "UNKNOWN";
    const stage = typeof request.stage === "string" ? request.stage : "UNKNOWN";
    const lines = diagnostics.records.flatMap((value) => {
      if (typeof value !== "object" || value === null) return [];
      const record = value as Record<string, unknown>;
      return [
        [
          record.sequence,
          record.component,
          record.event,
          record.stage,
          record.outcome,
          record.code,
        ]
          .filter(
            (part) => typeof part === "string" || typeof part === "number",
          )
          .join(" · "),
      ];
    });
    executionTrace.textContent = [
      `요청: ${request.request_id} · 버전: ${options.version()}`,
      `상태: ${state} · 단계: ${stage}`,
      `수집: ${diagnostics.level} · 누락: ${diagnostics.dropped_count}건${diagnostics.storage_failed ? " · 저장 실패" : ""}`,
      ...(diagnostics.level === "off"
        ? ["진단 수집이 꺼져 있습니다. 이전 상세 기록은 복원되지 않습니다."]
        : []),
      ...lines,
    ].join("\n");
  };
  const readTrace = (id: string) => readDiagnostics(sendRuntime, id);
  const refreshTrace = async (
    request: Record<string, unknown>,
  ): Promise<void> => {
    if (typeof request.request_id !== "string") return;
    try {
      const records = await readTrace(request.request_id);
      if (options.current() === request) renderExecutionTrace(request, records);
    } catch {
      if (options.current() === request)
        renderExecutionTrace(request, {
          records: [],
          level: "off",
          dropped_count: 0,
          storage_failed: true,
        });
    }
  };
  diagnosticsDebug?.addEventListener("click", () => {
    const level =
      diagnosticsDebug.dataset.level === "debug" ? "basic" : "debug";
    void sendRuntime({
      schema_version: 1,
      kind: "DIAGNOSTICS_SETTINGS_SET",
      level,
    })
      .then(() => {
        diagnosticsDebug.dataset.level = level;
        diagnosticsDebug.textContent =
          level === "debug"
            ? "개발 추적 끄기 (30분 자동 해제)"
            : "개발 추적 켜기";
        setStatus(
          level === "debug"
            ? "개발 추적을 켰습니다. 이후 요청의 trace가 Console에도 표시됩니다."
            : "개발 추적을 끄고 기본 수집으로 전환했습니다.",
        );
      })
      .catch((error: unknown) =>
        showFailure(error instanceof Error ? error.message : undefined),
      );
  });
  document
    .querySelector<HTMLButtonElement>("#diagnostics-export")
    ?.addEventListener("click", () => {
      const request = options.current();
      if (!request || typeof request.request_id !== "string") {
        setStatus("내보낼 요청 기록이 없습니다.");
        return;
      }
      const id = request.request_id;
      void readTrace(id)
        .then((records) => {
          const blob = new Blob(
            [
              JSON.stringify(
                {
                  schema_version: 1,
                  extension_version: options.version(),
                  request_id: id,
                  records: records.records,
                  dropped_count: records.dropped_count,
                },
                null,
                2,
              ),
            ],
            { type: "application/json" },
          );
          if (blob.size > 1024 * 1024)
            throw new Error("PAYLOAD_LIMIT_EXCEEDED");
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `contextpilot-trace-${id}.json`;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1_000);
        })
        .catch(() => setStatus("진단 기록을 다운로드할 수 없습니다."));
    });
  setInterval(() => {
    const request = options.current();
    if (!request || request.state === "TERMINAL" || !options.active()) return;
    const seconds = (value: unknown) =>
      typeof value === "number"
        ? Math.max(0, Math.floor((Date.now() - value) / 1000))
        : 0;
    const label =
      typeof request.stage === "string"
        ? ({
            PROVIDER_BODY: "응답 수신 중",
            DISPATCH: "실행 중",
            VERIFY: "결과 확인 중",
            ACCEPTED: "요청 접수됨",
          }[request.stage] ??
          activityLabel(request.stage as ActivityStage) ??
          "요청 처리 중")
        : "요청 처리 중";
    setActivityStatus(
      `${label} · 전체 ${seconds(request.started_at_ms)}초 · 현재 단계 ${seconds(request.stage_started_at_ms)}초 · 마지막 진척 ${seconds(request.last_progress_at_ms)}초 전`,
    );
  }, 1_000);

  return {
    refresh: refreshTrace,
    reset: () => {
      if (executionTrace)
        executionTrace.textContent = "아직 기록된 실행이 없습니다.";
    },
  };
};
