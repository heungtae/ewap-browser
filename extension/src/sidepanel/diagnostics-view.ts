import type { ActivityStage } from "../contracts/chat-event-types.js";
import { sha256 } from "../security/canonical.js";
import { readDiagnostics, type DiagnosticsPage } from "./diagnostics-client.js";
import { diagnosticZip } from "./zip.js";
type Reply = Record<string, unknown>;
type PanelDiagnosticMessage = {
  timestamp_ms: number;
  level: "error";
  code: string;
  message: string;
};
const diagnosticsReadme = (): string =>
  [
    "ContextPilot diagnostics bundle (redacted)",
    "",
    "execution-trace.json records allowed lifecycle events only.",
    "request.json contains mode, public state transitions and prompt length/digest.",
    "llm-processing.json contains redacted provider configuration and stage timing.",
    "llm-memory.json contains redacted event metadata, not message or action contents.",
    "page-data.json contains page-shape metadata, not URLs, source, or scripts.",
    "panel-failures.json records displayed panel codes/messages.",
    "",
    "A section marked unavailable or failed includes its collection code. Truncated means a bounded list was shortened.",
    "Reproduction template: page type; request mode; observed code; expected behavior; actual behavior; time range.",
    "Credentials, custom-header values, URLs, document source, scripts, and chat/action contents are excluded.",
  ].join("\n");
export const createDiagnosticsView = (options: {
  send(value: unknown): Promise<Reply>;
  current(): Reply | undefined;
  status(text: string): void;
  activity(text?: string): void;
  active(): boolean;
  label(stage: ActivityStage): string;
  version(): string;
  message(code: string): string;
  failure(code?: string): void;
}) => {
  const panelMessages: PanelDiagnosticMessage[] = [];
  let lastBundleSections: Record<string, Record<string, unknown>> | undefined;
  const executionDetails =
    document.querySelector<HTMLDetailsElement>("#execution-details");
  const executionTrace =
    document.querySelector<HTMLPreElement>("#execution-trace");
  const diagnosticsDebug =
    document.querySelector<HTMLButtonElement>("#diagnostics-debug");
  const diagnosticsDialog = document.querySelector<HTMLDialogElement>(
    "#diagnostics-dialog",
  );
  const diagnosticsDialogTrace = document.querySelector<HTMLPreElement>(
    "#diagnostics-dialog-trace",
  );
  const diagnosticsDialogClose = document.querySelector<HTMLButtonElement>(
    "#diagnostics-dialog-close",
  );
  const sendRuntime = options.send;
  const setStatus = options.status;
  const setActivityStatus = options.activity;
  const showFailure = options.failure;
  const activityLabel = options.label;
  const setExecutionTrace = (text: string): void => {
    if (executionTrace) executionTrace.textContent = text;
    if (diagnosticsDialogTrace) diagnosticsDialogTrace.textContent = text;
  };
  const showDiagnosticsDialog = (): void => {
    if (!diagnosticsDialog || !diagnosticsDialogTrace) return;
    diagnosticsDialogTrace.textContent = [
      executionTrace?.textContent || "아직 기록된 실행이 없습니다.",
      ...(lastBundleSections
        ? [
            "",
            "진단 다운로드 수집 결과",
            ...Object.entries(lastBundleSections).map(
              ([name, section]) =>
                `${name}: ${String(section.status)}${section.code ? ` · ${String(section.code)}` : ""}`,
            ),
          ]
        : []),
    ].join("\n");
    if (!diagnosticsDialog.open) diagnosticsDialog.showModal();
  };
  diagnosticsDialogClose?.addEventListener("click", () =>
    diagnosticsDialog?.close(),
  );
  const renderExecutionTrace = (
    request: Record<string, unknown>,
    diagnostics: DiagnosticsPage,
  ): void => {
    if (!executionDetails || !executionTrace) return;
    const containsError = diagnostics.records.some(
      (value) =>
        typeof value === "object" &&
        value !== null &&
        (value as Record<string, unknown>).level === "error",
    );
    executionDetails.hidden = false;
    if (diagnosticsDebug) {
      diagnosticsDebug.dataset.level = diagnostics.level;
      diagnosticsDebug.textContent =
        diagnostics.level === "trace"
          ? "개발 추적 끄기 (오류 기록만 유지)"
          : "개발 추적 켜기 (30분)";
    }
    if (
      diagnostics.level !== "trace" &&
      !containsError &&
      panelMessages.length === 0
    ) {
      setExecutionTrace(
        "개발 추적이 꺼져 있습니다. 오류가 발생하면 오류 코드만 기록합니다.",
      );
      return;
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
    const panelLines = panelMessages.map(
      (message) =>
        `panel · ${message.level} · ${message.code} · ${message.message}`,
    );
    setExecutionTrace(
      [
        `요청: ${request.request_id} · 버전: ${options.version()}`,
        `상태: ${state} · 단계: ${stage}`,
        `수집: ${diagnostics.level} · 누락: ${diagnostics.dropped_count}건${diagnostics.storage_failed ? " · 저장 실패" : ""}`,
        ...(diagnostics.level !== "trace"
          ? ["개발 추적이 꺼져 있어 오류 기록만 표시합니다."]
          : []),
        ...lines,
        ...panelLines,
      ].join("\n"),
    );
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
          level: "error",
          dropped_count: 0,
          storage_failed: true,
        });
    }
  };
  const setDiagnosticsLevel = async (
    level: "error" | "trace",
  ): Promise<void> => {
    await sendRuntime({
      schema_version: 1,
      kind: "DIAGNOSTICS_SETTINGS_SET",
      level,
    });
    if (diagnosticsDebug) {
      diagnosticsDebug.dataset.level = level;
      diagnosticsDebug.textContent =
        level === "trace"
          ? "개발 추적 끄기 (오류 기록만 유지)"
          : "개발 추적 켜기 (30분)";
    }
    setStatus(
      level === "trace"
        ? "개발 추적을 켰습니다. 이후 요청의 trace가 Console에도 표시됩니다."
        : "개발 추적을 끄고 오류 기록만 유지합니다.",
    );
  };
  const downloadDiagnostics = async (): Promise<void> => {
    const request = options.current();
    const requestId =
      typeof request?.request_id === "string" ? request.request_id : undefined;
    setStatus("진단 데이터를 수집하는 중...");
    try {
      const response = (await sendRuntime({
        schema_version: 1,
        kind: "DIAGNOSTICS_BUNDLE_EXPORT",
        ...(requestId ? { request_id: requestId } : {}),
      })) as { ok: boolean; data?: unknown; code?: string };
      if (!response.ok) {
        setStatus(`수집 실패: ${response.code || "알 수 없는 오류"}`);
        return;
      }
      const data = response.data as Record<string, unknown>;
      const sections = data.sections as Record<string, Record<string, unknown>>;
      if (!sections || typeof sections !== "object")
        throw new Error("INVALID_ARGUMENT");
      lastBundleSections = sections;
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);
      const fileRequestId = requestId ?? "panel";
      const section = (name: string): Record<string, unknown> =>
        sections[name] ?? { status: "unavailable", code: "NOT_COLLECTED" };
      const page = section("page");
      const pageData = page.data as Record<string, unknown> | undefined;
      const panelFailures = {
        schema_version: 1,
        failures: [
          ...panelMessages,
          ...(section("request").status === "unavailable"
            ? [
                {
                  timestamp_ms: Date.now(),
                  level: "error",
                  code: String(section("request").code ?? "REQUEST_NOT_FOUND"),
                  message: "요청 상태를 현재 패널에서 찾을 수 없습니다.",
                },
              ]
            : []),
        ],
      };
      const files = [
        {
          name: "execution-trace.json",
          text: JSON.stringify(section("execution_trace"), null, 2),
        },
        {
          name: "request.json",
          text: JSON.stringify(section("request"), null, 2),
        },
        {
          name: "llm-processing.json",
          text: JSON.stringify(section("llm_processing"), null, 2),
        },
        {
          name: "llm-memory.json",
          text: JSON.stringify(section("llm_memory"), null, 2),
        },
        {
          name: "page-load.json",
          text: JSON.stringify(
            pageData
              ? {
                  status: page.status,
                  document_epoch_digest: pageData.document_epoch_digest,
                  page_scope_epoch_digest: pageData.page_scope_epoch_digest,
                  document: pageData.document,
                }
              : page,
            null,
            2,
          ),
        },
        {
          name: "page-artifacts.json",
          text: JSON.stringify(
            pageData
              ? { status: page.status, artifacts: pageData.artifacts }
              : page,
            null,
            2,
          ),
        },
        {
          name: "page-data.json",
          text: JSON.stringify(pageData ? pageData.page : page, null, 2),
        },
        {
          name: "panel-failures.json",
          text: JSON.stringify(panelFailures, null, 2),
        },
        {
          name: "README.txt",
          text: diagnosticsReadme(),
        },
      ];
      const manifest = {
        schema_version: 1,
        extension_version: String(data.extension_version ?? options.version()),
        created_at_ms: data.collected_at_ms,
        request_id: requestId ?? null,
        sections: Object.fromEntries([
          ...Object.entries(sections)
            .filter(([name]) => name !== "page")
            .map(([name, value]) => [
              name,
              {
                status: value.status,
                ...(value.code ? { code: value.code } : {}),
              },
            ]),
          ...["page_load", "page_artifacts", "page_data"].map((name) => [
            name,
            {
              status: page.status,
              ...(page.code ? { code: page.code } : {}),
            },
          ]),
          ["panel_failures", { status: "collected" }],
        ]),
        files: files.map((file) => ({
          name: file.name,
          bytes: new TextEncoder().encode(file.text).byteLength,
          sha256: sha256(file.text),
        })),
      };
      files.unshift({
        name: "manifest.json",
        text: JSON.stringify(manifest, null, 2),
      });
      const zipData = diagnosticZip(files);
      const blob = new Blob([zipData], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `contextpilot-diagnostics-${timestamp}-${fileRequestId}.zip`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setStatus(
        `${link.download}을 저장했습니다. GitHub Issue에 첨부해 주세요.`,
      );
    } catch (error) {
      setStatus(
        `다운로드 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`,
      );
    }
  };
  diagnosticsDebug?.addEventListener("click", () => {
    const level =
      diagnosticsDebug.dataset.level === "trace" ? "error" : "trace";
    void setDiagnosticsLevel(level).catch((error: unknown) =>
      showFailure(error instanceof Error ? error.message : undefined),
    );
  });
  document
    .querySelector<HTMLButtonElement>("#diagnostics-export")
    ?.addEventListener("click", () => void downloadDiagnostics());
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
    download: downloadDiagnostics,
    open: (): void => {
      if (executionDetails) {
        executionDetails.hidden = false;
        executionDetails.open = true;
        executionDetails.scrollIntoView({ block: "nearest" });
      }
      showDiagnosticsDialog();
      const request = options.current();
      if (request) void refreshTrace(request);
      setStatus("진단 창에서 기록을 확인할 수 있습니다.");
    },
    failure: (code: string) => {
      panelMessages.push({
        timestamp_ms: Date.now(),
        level: "error",
        code,
        message: options.message(code),
      });
      if (panelMessages.length > 50) panelMessages.splice(0, 1);
      if (executionDetails) executionDetails.hidden = false;
      setExecutionTrace(
        [
          `패널 요청 실패: ${code} · 버전: ${options.version()}`,
          ...panelMessages.map(
            (message) => `${message.code} · ${message.message}`,
          ),
        ].join("\n"),
      );
    },
    reset: () => {
      panelMessages.splice(0, panelMessages.length);
      lastBundleSections = undefined;
      setExecutionTrace("아직 기록된 실행이 없습니다.");
    },
  };
};
