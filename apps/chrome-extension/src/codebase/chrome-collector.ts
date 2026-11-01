import { canonical, type Batch } from "@contextpilot/codebase-schema";
import type { CollectorPort, DiscoveryAdmission } from "./discover.js";
import { waitForCollection } from "./collection-wait.js";
import { collectResponseSchema } from "./collector-protocol.js";
export interface FrameBinding {
  documentId: string;
  url: string;
  errorOccurred?: boolean;
  documentLifecycle?: string;
}
interface NavigationEvent {
  addListener(
    callback: (info: { tabId: number; frameId: number }) => void,
  ): void;
  removeListener(
    callback: (info: { tabId: number; frameId: number }) => void,
  ): void;
}
export interface CollectorChrome {
  webNavigation: {
    onBeforeNavigate: NavigationEvent;
    onCommitted: NavigationEvent;
    onHistoryStateUpdated: NavigationEvent;
    onReferenceFragmentUpdated: NavigationEvent;
    getFrame(query: {
      tabId: number;
      frameId: number;
    }): Promise<FrameBinding | undefined>;
  };
  tabs: {
    onRemoved: {
      addListener(callback: (tabId: number) => void): void;
      removeListener(callback: (tabId: number) => void): void;
    };
    sendMessage(
      tabId: number,
      value: unknown,
      options: { documentId: string },
    ): Promise<unknown>;
  };
}
// Worker-side read port. Consent/admission is supplied by the trusted caller;
// this adapter does not infer permission from a page, profile, or stored recipe.
export class ChromeCollector implements CollectorPort {
  private tabId: number | undefined;
  private live = true;
  private invalidate = (info: { tabId: number; frameId: number }) => {
    if (info.tabId === this.tabId && info.frameId === 0) this.live = false;
  };
  private removed = (id: number) => {
    if (id === this.tabId) this.live = false;
  };
  private events: NavigationEvent[];
  isCurrent() {
    return this.live;
  }
  dispose() {
    this.live = false;
    for (const event of this.events) event.removeListener(this.invalidate);
    this.chrome.tabs.onRemoved.removeListener(this.removed);
  }
  constructor(
    private chrome: CollectorChrome,
    private binding: FrameBinding,
  ) {
    this.binding = { ...binding };
    const navigation = chrome.webNavigation;
    this.events = [
      navigation.onBeforeNavigate,
      navigation.onCommitted,
      navigation.onHistoryStateUpdated,
      navigation.onReferenceFragmentUpdated,
    ];
    for (const event of this.events) event.addListener(this.invalidate);
    chrome.tabs.onRemoved.addListener(this.removed);
  }
  collect(admission: DiscoveryAdmission): Promise<Batch> {
    const bounded = {
      ...admission,
      deadline: Math.min(admission.deadline, Date.now() + 10000),
    };
    return waitForCollection(
      this.run(bounded),
      admission.signal,
      bounded.deadline,
    );
  }
  private async run(admission: DiscoveryAdmission): Promise<Batch> {
    const { context, signal } = admission;
    if (
      !this.live ||
      !admission.readAllowed ||
      signal.aborted ||
      context.source.frameId !== 0 ||
      admission.deadline <= Date.now()
    )
      throw new Error("DISCOVERY_SCOPE_DENIED");
    if (this.tabId !== undefined && this.tabId !== context.source.tabId)
      throw new Error("BINDING_STALE");
    this.tabId = context.source.tabId;
    const fresh = async () => {
      const frame = await this.chrome.webNavigation.getFrame({
        tabId: context.source.tabId,
        frameId: 0,
      });
      if (
        !this.live ||
        signal.aborted ||
        Date.now() >= admission.deadline ||
        !frame ||
        frame.errorOccurred ||
        (frame.documentLifecycle !== undefined &&
          frame.documentLifecycle !== "active") ||
        frame.documentId !== this.binding.documentId ||
        frame.url !== this.binding.url ||
        new URL(frame.url).origin !== context.origin
      )
        throw new Error("BINDING_STALE");
    };
    await fresh();
    const requestId = crypto.randomUUID();
    const options = { documentId: this.binding.documentId };
    const tabId = context.source.tabId;
    let abort: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => {
      void this.chrome.tabs
        .sendMessage(tabId, { kind: "wca.codebase.cancel", requestId }, options)
        .catch(() => undefined);
    };
    try {
      if (signal.aborted || Date.now() >= admission.deadline)
        throw new Error("COLLECTION_CANCELLED");
      const interrupted = new Promise<never>((_resolve, reject) => {
        abort = () => {
          cancel();
          reject(new Error("COLLECTION_CANCELLED"));
        };
        signal.addEventListener("abort", abort, { once: true });
        timer = setTimeout(
          abort,
          Math.max(0, Math.min(10000, admission.deadline - Date.now())),
        );
      });
      const decoded = collectResponseSchema.safeParse(
        await Promise.race([
          this.chrome.tabs.sendMessage(
            tabId,
            {
              kind: "wca.codebase.collect",
              requestId,
              url: this.binding.url,
              batchId: admission.batchId,
              context,
              expectedRevision: admission.expectedRevision,
              scope: admission.scope,
              deadline: Math.min(admission.deadline, Date.now() + 10000),
            },
            options,
          ),
          interrupted,
        ]),
      );
      if (!decoded.success) throw new Error("COLLECTOR_INVALID_RESPONSE");
      const result = decoded.data;
      if (!result.ok) throw new Error(result.code);
      await fresh();
      if (
        result.batch.scope !== admission.scope ||
        result.batch.batchId !== admission.batchId ||
        result.batch.expectedRevision !== admission.expectedRevision ||
        canonical(result.batch.context) !== canonical(context)
      )
        throw new Error("COLLECTOR_CONTEXT_MISMATCH");
      return result.batch;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      if (abort) signal.removeEventListener("abort", abort);
    }
  }
}
