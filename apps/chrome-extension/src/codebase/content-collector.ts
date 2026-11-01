import { collect } from "@contextpilot/collector";
import {
  cancelRequestSchema,
  collectRequestSchema,
} from "./collector-protocol.js";
interface Sender {
  id?: string;
  url?: string;
  tab?: unknown;
}
export interface CollectorRuntime {
  id: string;
  onMessage: {
    addListener(
      callback: (
        value: unknown,
        sender: Sender,
        reply: (value: unknown) => void,
      ) => boolean,
    ): void;
    removeListener(
      callback: (
        value: unknown,
        sender: Sender,
        reply: (value: unknown) => void,
      ) => boolean,
    ): void;
  };
}
// Content-side collector only: no repository, task, policy grant or model imports.
export function installContentCollector(
  runtime: CollectorRuntime,
  root: () => Element | null,
  read: typeof collect = collect,
) {
  const active = new Map<string, AbortController>();
  const seen = new Set<string>();
  const listener = (
    value: unknown,
    sender: Sender,
    reply: (value: unknown) => void,
  ) => {
    if (
      !value ||
      typeof value !== "object" ||
      !["wca.codebase.collect", "wca.codebase.cancel"].includes(
        String((value as Record<string, unknown>).kind),
      )
    )
      return false;
    if (
      sender.id !== runtime.id ||
      sender.url !== `chrome-extension://${runtime.id}/js/service-worker.js` ||
      sender.tab !== undefined
    ) {
      reply({ ok: false, code: "COLLECTOR_DENIED" });
      return true;
    }
    const cancel = cancelRequestSchema.safeParse(value);
    if (cancel.success) {
      active.get(cancel.data.requestId)?.abort();
      reply({ ok: true });
      return true;
    }
    const parsed = collectRequestSchema.safeParse(value);
    if (!parsed.success) {
      reply({ ok: false, code: "COLLECTOR_DENIED" });
      return true;
    }
    const request = parsed.data;
    const element = root();
    if (
      !element ||
      active.size >= 4 ||
      seen.size >= 1024 ||
      seen.has(request.requestId) ||
      request.deadline <= Date.now() ||
      request.deadline > Date.now() + 10000 ||
      request.context.source.frameId !== 0 ||
      element.ownerDocument.URL !== request.url ||
      new URL(request.url).origin !== request.context.origin
    ) {
      reply({ ok: false, code: "COLLECTOR_DENIED" });
      return true;
    }
    seen.add(request.requestId);
    const controller = new AbortController();
    active.set(request.requestId, controller);
    const timer = setTimeout(
      () => controller.abort(),
      Math.max(0, request.deadline - Date.now()),
    );
    const current = () =>
      !controller.signal.aborted && element.ownerDocument.URL === request.url;
    void read(element, { ...request, signal: controller.signal, current })
      .then((batch) => {
        if (!current() || Date.now() >= request.deadline)
          throw new Error("COLLECTOR_STALE");
        reply({ ok: true, batch });
      })
      .catch(() => reply({ ok: false, code: "COLLECTOR_UNAVAILABLE" }))
      .finally(() => {
        clearTimeout(timer);
        active.delete(request.requestId);
      });
    return true;
  };
  runtime.onMessage.addListener(listener);
  return () => {
    runtime.onMessage.removeListener(listener);
    for (const controller of active.values()) controller.abort();
    active.clear();
  };
}
