import type { DiagnosticsLevel } from "./execution-diagnostics.js";
import {
  requestId,
  type Dependencies,
} from "./request-message-dependencies.js";
import {
  exactKeys,
  failureCode,
  type RuntimeSender,
  type Respond,
  type RoutedMessage,
} from "./runtime-message-router.js";
import { extensionVersion } from "./extension-version.js";

export const createDiagnosticsMessageHandler = (
  dependencies: Dependencies,
) => ({
  diagnostics(
    message: object,
    sender: RuntimeSender,
    respond: Respond,
    kind: "DIAGNOSTICS_LIST" | "DIAGNOSTICS_CLEAR",
  ): RoutedMessage {
    const id = (message as { request_id?: unknown }).request_id;
    const list = kind === "DIAGNOSTICS_LIST";
    const after = (message as { after_sequence?: unknown }).after_sequence;
    const limit = (message as { limit?: unknown }).limit;
    const keys = list
      ? ["schema_version", "kind", "request_id", "after_sequence", "limit"]
      : ["schema_version", "kind", "request_id"];
    if (
      !dependencies.isPanelSender(sender) ||
      !exactKeys(message, keys) ||
      (message as { schema_version?: unknown }).schema_version !== 1 ||
      !requestId(id) ||
      (list &&
        (!Number.isInteger(after) ||
          (after as number) < 0 ||
          !Number.isInteger(limit) ||
          (limit as number) < 1 ||
          (limit as number) > 100))
    ) {
      respond(dependencies.safeFailure("INVALID_ARGUMENT"));
      return { handled: true };
    }
    void dependencies
      .activeTab(sender)
      .then((active) => {
        if (
          !dependencies.requests.status(id, active.id, sender.documentId ?? "")
        ) {
          respond(dependencies.safeFailure("REQUEST_NOT_FOUND"));
          return;
        }
        if (list) {
          const result = dependencies.diagnostics?.list(
            id,
            active.id,
            after as number,
            limit as number,
          );
          respond(
            result
              ? { ok: true, ...result }
              : dependencies.safeFailure("REQUEST_NOT_FOUND"),
          );
        } else {
          respond(
            dependencies.diagnostics?.clear(id, active.id)
              ? { ok: true }
              : dependencies.safeFailure("REQUEST_NOT_FOUND"),
          );
        }
      })
      .catch((error) =>
        respond(
          dependencies.safeFailure(
            failureCode(error, "PANEL_CONTEXT_UNAVAILABLE"),
          ),
        ),
      );
    return { handled: true, keepAlive: true };
  },
  settings(
    message: object,
    sender: RuntimeSender,
    respond: Respond,
  ): RoutedMessage {
    const level = (message as { level?: unknown }).level;
    if (
      !dependencies.isPanelSender(sender) ||
      !exactKeys(message, ["schema_version", "kind", "level"]) ||
      (message as { schema_version?: unknown }).schema_version !== 1 ||
      !["error", "warn", "info", "debug", "trace"].includes(String(level))
    ) {
      respond(dependencies.safeFailure("INVALID_ARGUMENT"));
      return { handled: true };
    }
    if (!dependencies.diagnostics) {
      respond(dependencies.safeFailure("STORAGE_BOUNDARY_UNAVAILABLE"));
      return { handled: true };
    }
    respond({
      ok: true,
      level: dependencies.diagnostics.setLevel(level as DiagnosticsLevel),
    });
    return { handled: true };
  },
  bundleExport(
    message: object,
    sender: RuntimeSender,
    respond: Respond,
  ): RoutedMessage {
    if (
      !dependencies.isPanelSender(sender) ||
      !(
        exactKeys(message, ["schema_version", "kind"]) ||
        exactKeys(message, ["schema_version", "kind", "request_id"])
      ) ||
      (message as { schema_version?: unknown }).schema_version !== 1
    ) {
      respond(dependencies.safeFailure("INVALID_ARGUMENT"));
      return { handled: true };
    }
    const requestIdOpt = (message as { request_id?: unknown }).request_id;
    if (requestIdOpt !== undefined && !requestId(requestIdOpt)) {
      respond(dependencies.safeFailure("INVALID_ARGUMENT"));
      return { handled: true };
    }
    void dependencies
      .activeTab(sender)
      .then(async (active) => {
        if (!dependencies.diagnostics) {
          respond(dependencies.safeFailure("STORAGE_BOUNDARY_UNAVAILABLE"));
          return;
        }
        const tabId = active.id;
        const diagnostics = dependencies.diagnostics;
        const trace = diagnostics.listForTab(tabId);
        const request =
          requestIdOpt === undefined
            ? undefined
            : dependencies.requests.diagnosticSnapshot(requestIdOpt, tabId);
        const requestData = request && {
          ...request,
          transitions: trace.records
            .filter((record) => record.request_id === requestIdOpt)
            .map((record) => ({
              sequence: record.sequence,
              event: record.event,
              ...(record.stage ? { stage: record.stage } : {}),
              ...(record.outcome ? { outcome: record.outcome } : {}),
              ...(record.code ? { code: record.code } : {}),
              elapsed_ms: record.elapsed_ms,
            })),
        };
        const sections: Record<string, Record<string, unknown>> = {
          execution_trace: {
            status: "collected",
            data: {
              records: trace.records,
              dropped_count: trace.dropped_count,
              level: trace.level,
              storage_failed: trace.storage_failed,
              worker_instance_id: diagnostics.getWorkerInstanceId(),
            },
          },
          request: requestData
            ? { status: "collected", data: requestData }
            : {
                status: "unavailable",
                code:
                  requestIdOpt === undefined
                    ? "REQUEST_ID_NOT_PROVIDED"
                    : "REQUEST_NOT_FOUND",
              },
          llm_memory: {
            status: "collected",
            data: dependencies.chatEvents.diagnosticSnapshot(tabId),
          },
        };
        try {
          sections.llm_processing = {
            status: "collected",
            data: {
              provider: safeProviderDiagnostics(
                (await dependencies.providerDiagnostics?.()) ?? {
                  configured: false,
                },
              ),
              stages: trace.records
                .filter(
                  (record) =>
                    record.component === "provider" ||
                    record.component === "act",
                )
                .map((record) => ({
                  sequence: record.sequence,
                  event: record.event,
                  ...(record.stage ? { stage: record.stage } : {}),
                  ...(record.outcome ? { outcome: record.outcome } : {}),
                  ...(record.code ? { code: record.code } : {}),
                  elapsed_ms: record.elapsed_ms,
                })),
            },
          };
        } catch (error) {
          sections.llm_processing = {
            status: "unavailable",
            code: failureCode(error, "STORAGE_BOUNDARY_UNAVAILABLE"),
          };
        }
        try {
          const page = await dependencies.sendToContentScript(tabId, {
            schema_version: 1,
            kind: "CONTENT_DIAGNOSTICS_SUMMARY",
          });
          const summary = safeContentDiagnosticsSummary(page);
          if (!summary) throw new Error("INVALID_ARGUMENT");
          sections.page = { status: "collected", data: summary };
        } catch (error) {
          sections.page = {
            status: "unavailable",
            code: failureCode(error, "CONTENT_SCRIPT_UNAVAILABLE"),
          };
        }
        respond({
          ok: true as const,
          data: {
            schema_version: 1,
            request_id: requestIdOpt,
            extension_version: extensionVersion,
            collected_at_ms: Date.now(),
            sections,
          },
        });
      })
      .catch((error) =>
        respond(
          dependencies.safeFailure(
            failureCode(error, "PANEL_CONTEXT_UNAVAILABLE"),
          ),
        ),
      );
    return { handled: true, keepAlive: true };
  },
});

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const finiteCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const stringMap = (value: unknown): value is Record<string, number> =>
  isObject(value) &&
  Object.keys(value).length <= 100 &&
  Object.values(value).every(finiteCount);
/** Defense in depth: a provider runtime must not be able to widen bundle data. */
const safeProviderDiagnostics = (value: unknown): Record<string, unknown> => {
  if (!isObject(value) || value.configured !== true)
    return { configured: false };
  const config = isObject(value.config) ? value.config : value;
  const string = (key: string): string | undefined =>
    typeof config[key] === "string" ? config[key] : undefined;
  const boolean = (key: string): boolean | undefined =>
    typeof config[key] === "boolean" ? config[key] : undefined;
  const count =
    typeof config.custom_header_count === "number" &&
    Number.isSafeInteger(config.custom_header_count) &&
    config.custom_header_count >= 0
      ? config.custom_header_count
      : Array.isArray(config.headers)
        ? config.headers.length
        : Array.isArray(config.header_names)
          ? config.header_names.length
          : 0;
  return {
    configured: true,
    config: {
      ...(string("plugin_id") ? { plugin_id: string("plugin_id") } : {}),
      ...(string("plugin_version")
        ? { plugin_version: string("plugin_version") }
        : {}),
      ...(string("wire_api") ? { wire_api: string("wire_api") } : {}),
      ...(string("model") ? { model: string("model") } : {}),
      ...(string("api_key_header")
        ? { api_key_header: string("api_key_header") }
        : {}),
      ...(typeof config.timeout_ms === "number" &&
      Number.isSafeInteger(config.timeout_ms)
        ? { timeout_ms: config.timeout_ms }
        : {}),
      ...(boolean("enabled") === undefined
        ? {}
        : { enabled: boolean("enabled") }),
      ...(boolean("private_network_opt_in") === undefined
        ? {}
        : { private_network_opt_in: boolean("private_network_opt_in") }),
      api_key_configured:
        boolean("has_api_key") ??
        (typeof config.api_key === "string" && config.api_key.length > 0),
      custom_header_count: count,
    },
  };
};
/** Runtime validation keeps an untrusted message response from widening ZIP data. */
const safeContentDiagnosticsSummary = (
  value: unknown,
): Record<string, unknown> | undefined => {
  if (!isObject(value) || value.ok !== true || value.schema_version !== 1)
    return;
  const document = value.document;
  const artifacts = value.artifacts;
  const page = value.page;
  if (
    !isObject(document) ||
    !isObject(artifacts) ||
    !isObject(artifacts.html) ||
    !isObject(artifacts.scripts) ||
    !isObject(page)
  )
    return;
  const tables = document.table_shape;
  const scripts = artifacts.scripts;
  if (
    !(
      typeof value.document_epoch_digest === "string" &&
      typeof value.page_scope_epoch_digest === "string" &&
      ["loading", "interactive", "complete"].includes(
        String(document.ready_state),
      ) &&
      finiteCount(document.element_count) &&
      finiteCount(document.table_count) &&
      finiteCount(document.list_count) &&
      finiteCount(document.form_count) &&
      stringMap(document.role_counts) &&
      stringMap(document.input_counts) &&
      Array.isArray(tables) &&
      tables.length <= 100 &&
      tables.every(
        (table) =>
          isObject(table) &&
          finiteCount(table.rows) &&
          finiteCount(table.columns),
      ) &&
      finiteCount(artifacts.html.bytes) &&
      typeof artifacts.html.sha256 === "string" &&
      finiteCount(scripts.total) &&
      finiteCount(scripts.inline_count) &&
      finiteCount(scripts.external_count) &&
      finiteCount(scripts.total_bytes) &&
      Array.isArray(scripts.digests) &&
      scripts.digests.length <= 100 &&
      scripts.digests.every((digest) => typeof digest === "string") &&
      stringMap(scripts.type_counts) &&
      typeof scripts.truncated === "boolean" &&
      isObject(page.url_shape) &&
      typeof page.url_shape.has_query === "boolean" &&
      typeof page.url_shape.has_fragment === "boolean" &&
      finiteCount(page.url_shape.path_segment_count) &&
      finiteCount(page.title_length) &&
      typeof page.referrer_present === "boolean"
    )
  )
    return;
  return {
    schema_version: 1,
    document_epoch_digest: value.document_epoch_digest,
    page_scope_epoch_digest: value.page_scope_epoch_digest,
    document: {
      ready_state: document.ready_state,
      element_count: document.element_count,
      role_counts: document.role_counts,
      table_count: document.table_count,
      table_shape: tables.map((table) => ({
        rows: (table as Record<string, number>).rows,
        columns: (table as Record<string, number>).columns,
      })),
      list_count: document.list_count,
      form_count: document.form_count,
      input_counts: document.input_counts,
    },
    artifacts: {
      html: { bytes: artifacts.html.bytes, sha256: artifacts.html.sha256 },
      scripts: {
        total: scripts.total,
        inline_count: scripts.inline_count,
        external_count: scripts.external_count,
        total_bytes: scripts.total_bytes,
        digests: scripts.digests,
        type_counts: scripts.type_counts,
        truncated: scripts.truncated,
      },
    },
    page: {
      url_shape: page.url_shape,
      title_length: page.title_length,
      referrer_present: page.referrer_present,
    },
  };
};
