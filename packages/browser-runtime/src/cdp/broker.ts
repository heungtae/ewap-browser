import { canonical } from "@contextpilot/codebase-schema";
import { contextSchema, type ToolContext } from "@contextpilot/tool-registry";
import {
  CdpAttachDenied,
  within,
  type BrokerOptions,
  type CdpCapability,
} from "./types.js";
import { networkWindow, type NetworkAccess } from "./network-window.js";
export class BoundedCdpBroker {
  private captures = 0;
  private active = new Set<number>();
  private quarantined = new Set<number>();
  constructor(private options: BrokerOptions) {}
  isQuarantined(tabId: number): boolean {
    return this.quarantined.has(tabId);
  }
  private async session<T>(
    cap: CdpCapability,
    raw: ToolContext,
    signal: AbortSignal,
    operation: (
      send: (
        method: string,
        params: Record<string, unknown>,
      ) => Promise<unknown>,
    ) => Promise<T>,
  ): Promise<T> {
    const context = contextSchema.parse(raw);
    const tab = context.tabId;
    const owner = `cdp_${crypto.randomUUID()}`;
    let owned = false,
      closed = false,
      detached = false;
    let unlisten = () => {};
    const check = () => {
      if (closed || detached || signal.aborted) throw new Error("CDP_CLOSED");
      if (
        Date.now() >= Math.min(context.deadline, context.leaseExpiresAt) ||
        canonical(context) !== canonical(this.options.current())
      )
        throw new Error("CDP_BINDING_STALE");
      if (!this.options.allowed(cap, context))
        throw new Error("CDP_PERMISSION_DENIED");
    };
    check();
    if (this.active.has(tab) || this.quarantined.has(tab))
      throw new Error("CDP_UNAVAILABLE");
    this.active.add(tab);
    try {
      if (!(await this.options.ownership.available(tab)))
        throw new Error("CDP_RECOVERY_REQUIRED");
      await this.options.ownership.mark(tab, owner, "attaching");
      const attach = this.options.transport.attach(tab).then(() => {
        owned = true;
      });
      try {
        await within(attach, 2000);
      } catch (error) {
        if (!(error instanceof CdpAttachDenied)) {
          this.quarantined.add(tab);
          await this.options.ownership.mark(tab, owner, "quarantined");
          void attach
            .then(() => this.options.transport.detach(tab))
            .catch(() => {});
        } else await this.options.ownership.clear(tab, owner);
        throw error;
      }
      await this.options.ownership.mark(tab, owner, "owned");
      unlisten = this.options.transport.onDetach(tab, () => {
        detached = true;
      });
      check();
      const send = async (method: string, params: Record<string, unknown>) => {
        check();
        const result = await within(
          this.options.transport.send(tab, method, params),
          Math.min(10000, context.deadline - Date.now()),
        );
        check();
        return result;
      };
      return await within(
        operation(send),
        Math.min(10000, context.deadline - Date.now()),
      );
    } finally {
      closed = true;
      unlisten();
      if (owned) {
        try {
          if (!detached) await within(this.options.transport.detach(tab), 2000);
          if (!this.quarantined.has(tab))
            await this.options.ownership.clear(tab, owner);
        } catch {
          this.quarantined.add(tab);
          await this.options.ownership.mark(tab, owner, "quarantined");
        }
      }
      this.active.delete(tab);
    }
  }
  ax(context: ToolContext, signal: AbortSignal) {
    return this.session("ax", context, signal, (send) =>
      send("Accessibility.getFullAXTree", { depth: 4 }),
    );
  }
  network<T>(
    context: ToolContext,
    signal: AbortSignal,
    origin: string,
    inspect: (access: NetworkAccess) => Promise<T>,
  ) {
    return this.session("network", context, signal, (send) =>
      networkWindow(
        this.options.transport,
        context,
        signal,
        origin,
        send,
        inspect,
      ),
    );
  }
  capture(context: ToolContext, signal: AbortSignal, consent: () => void) {
    return this.session("capture", context, signal, async (send) => {
      consent();
      if (this.captures >= 2) throw new Error("SCREENSHOT_COUNT_LIMIT");
      this.captures++;
      const image = (await send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false,
        fromSurface: true,
      })) as { data?: unknown };
      consent();
      if (
        typeof image.data !== "string" ||
        image.data.length > Math.ceil((2 * 1024 * 1024 * 4) / 3) + 4
      )
        throw new Error("SCREENSHOT_BYTE_LIMIT");
      return { data: image.data };
    });
  }
  async insertText(
    context: ToolContext,
    signal: AbortSignal,
    text: string,
    before: () => void,
  ) {
    if (context.mode !== "act" || text.length > 10000)
      throw new Error("CDP_INPUT_DENIED");
    return this.session("input", context, signal, (send) => {
      before();
      return send("Input.insertText", { text });
    });
  }
}
