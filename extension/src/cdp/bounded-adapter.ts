import type { ErrorCode } from "../contracts/types.js";
import type { Capability } from "../policy/permission-manager.js";
import { permissionHost } from "../policy/permission-manager.js";
import { ContractError, fail } from "../security/validation.js";
import { recoverCdpSessions } from "./cdp-recovery.js";

export type BoundedCdpTool =
  | "click_by_ref"
  | "press_key_by_ref"
  | "set_text_by_ref";
export type BoundedCdpAction = {
  runId: string;
  actionId: string;
  tabId: number;
  frameId: number;
  documentId: string;
  documentEpoch: string;
  refId: string;
  tool: BoundedCdpTool;
  risk: "R1" | "R2";
  confirmationDigest?: string;
  actionToken: string;
  origin: string;
  capability: Capability;
};
export type PreparedTarget = {
  unique: boolean;
  sensitive: boolean;
  stale: boolean;
  visible: boolean;
  enabled: boolean;
  occluded: boolean;
  editable: boolean;
  viewportWidth: number;
  viewportHeight: number;
};
export type Debuggee = { tabId: number };
export type DebuggerApi = {
  attach(target: Debuggee, version: "1.3"): Promise<void>;
  sendCommand(
    target: Debuggee,
    method: string,
    params?: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  detach(target: Debuggee): Promise<void>;
  onDetach?: {
    addListener(listener: (target: Debuggee, reason: string) => void): void;
  };
};
export type SessionMarker = {
  tabId: number;
  runId: string;
  actionId: string;
  phase: "attaching" | "attached";
};
export type MarkerStore = {
  set(marker: SessionMarker): Promise<void>;
  clear(tabId: number): Promise<void>;
  list?(): Promise<SessionMarker[]>;
};
export type TargetBridge = {
  prepare(action: BoundedCdpAction): Promise<PreparedTarget>;
  clear(action: BoundedCdpAction): Promise<void>;
};
export type CdpExecution = {
  dispatched: boolean;
  outcome: "DISPATCHED" | "FAILED" | "UNKNOWN";
};

const keyCodes = new Set(["Enter", "Space", "Escape", "Tab"]);
const actionKeys = new Set([
  "runId",
  "actionId",
  "tabId",
  "frameId",
  "documentId",
  "documentEpoch",
  "refId",
  "tool",
  "risk",
  "confirmationDigest",
  "actionToken",
  "origin",
  "capability",
]);
const tokenPattern = /^[A-Za-z0-9_-]{22,128}$/;
const nodeId = (value: unknown): number =>
  typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : fail("TARGET_NOT_ACTIONABLE");
const number = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fail("TARGET_NOT_ACTIONABLE");

export class BoundedCdpAdapter {
  private readonly quarantined = new Set<number>();
  private readonly active = new Set<number>();
  private readonly attached = new Set<number>();
  private readonly aborted = new Set<number>();
  private readonly cleaning = new Map<number, Promise<void>>();
  private recovery: Promise<void> = Promise.resolve();
  public constructor(
    private readonly debuggerApi: DebuggerApi,
    private readonly markers: MarkerStore,
    private readonly bridge: TargetBridge,
    private readonly isGranted: (
      capability: Capability,
      origin: string,
      runId: string,
    ) => boolean,
  ) {}

  public isQuarantined(tabId: number): boolean {
    return this.quarantined.has(tabId);
  }

  public startRecovery(): void {
    if (!this.markers.list) return;
    this.recovery = recoverCdpSessions(
      this.debuggerApi,
      this.markers,
      (tabId) => this.quarantined.add(tabId),
    );
  }

  public onDetach(tabId: number): void {
    this.attached.delete(tabId);
    if (this.active.has(tabId)) this.aborted.add(tabId);
    this.quarantined.delete(tabId);
    void this.markers.clear(tabId).catch(() => undefined);
  }

  public async abortTab(tabId: number): Promise<void> {
    if (!this.active.has(tabId)) return;
    this.aborted.add(tabId);
    await this.cleanupOwned(tabId);
  }

  private async cleanupOwned(tabId: number): Promise<void> {
    const existing = this.cleaning.get(tabId);
    if (existing) return existing;
    if (!this.attached.has(tabId)) return;
    const target = { tabId };
    const cleanup = (async () => {
      await this.debuggerApi
        .sendCommand(target, "DOM.disable")
        .catch(() => undefined);
      try {
        await this.debuggerApi.detach(target);
        this.attached.delete(tabId);
        await this.markers.clear(tabId);
      } catch {
        this.quarantined.add(tabId);
      }
    })();
    this.cleaning.set(tabId, cleanup);
    try {
      await cleanup;
    } finally {
      this.cleaning.delete(tabId);
    }
  }

  public async execute(
    action: BoundedCdpAction,
    input?: { key?: string; text?: string },
  ): Promise<CdpExecution> {
    await this.recovery;
    this.validateAction(action, input);
    if (this.quarantined.has(action.tabId)) fail("CDP_CLEANUP_FAILED");
    permissionHost(action.origin);
    if (!this.isGranted(action.capability, action.origin, action.runId))
      fail("PERMISSION_REQUIRED");
    if (action.risk === "R2" && !action.confirmationDigest)
      fail("CONFIRMATION_INVALID");
    const prepared = await this.bridge.prepare(action);
    if (
      !prepared.unique ||
      prepared.sensitive ||
      prepared.stale ||
      !prepared.visible ||
      !prepared.enabled ||
      prepared.occluded ||
      (action.tool === "set_text_by_ref" && !prepared.editable)
    )
      fail(prepared.stale ? "TARGET_STALE" : "TARGET_NOT_ACTIONABLE");
    if (!this.isGranted(action.capability, action.origin, action.runId))
      fail("PERMISSION_REQUIRED");

    const target = { tabId: action.tabId };
    let attached = false;
    let dispatched = false;
    this.active.add(action.tabId);
    try {
      await this.markers.set({
        tabId: action.tabId,
        runId: action.runId,
        actionId: action.actionId,
        phase: "attaching",
      });
      try {
        await this.debuggerApi.attach(target, "1.3");
      } catch (error) {
        return fail(this.attachCode(error));
      }
      attached = true;
      this.attached.add(action.tabId);
      await this.markers.set({
        tabId: action.tabId,
        runId: action.runId,
        actionId: action.actionId,
        phase: "attached",
      });
      await this.debuggerApi.sendCommand(target, "DOM.enable");
      const document = await this.debuggerApi.sendCommand(
        target,
        "DOM.getDocument",
        { depth: 0, pierce: false },
      );
      const root = document.root as Record<string, unknown> | undefined;
      const rootNodeId = nodeId(root?.nodeId);
      const selected = await this.debuggerApi.sendCommand(
        target,
        "DOM.querySelectorAll",
        {
          nodeId: rootNodeId,
          selector: `[data-contextpilot-action-token="${action.actionToken}"]`,
        },
      );
      const nodeIds = selected.nodeIds;
      if (!Array.isArray(nodeIds) || nodeIds.length !== 1)
        fail("TARGET_NOT_ACTIONABLE");
      const selectedNodeIds = nodeIds as unknown[];
      const boundNode = nodeId(selectedNodeIds[0]);
      await this.debuggerApi.sendCommand(target, "DOM.scrollIntoViewIfNeeded", {
        nodeId: boundNode,
      });
      const box = await this.debuggerApi.sendCommand(
        target,
        "DOM.getBoxModel",
        {
          nodeId: boundNode,
        },
      );
      const model = box.model as Record<string, unknown> | undefined;
      const content = model?.content;
      if (!Array.isArray(content) || content.length !== 8)
        fail("TARGET_NOT_ACTIONABLE");
      const coordinates = content as unknown[];
      const xs = [
        number(coordinates[0]),
        number(coordinates[2]),
        number(coordinates[4]),
        number(coordinates[6]),
      ];
      const ys = [
        number(coordinates[1]),
        number(coordinates[3]),
        number(coordinates[5]),
        number(coordinates[7]),
      ];
      const x = xs.reduce((sum, item) => sum + item, 0) / 4;
      const y = ys.reduce((sum, item) => sum + item, 0) / 4;
      if (
        !Number.isFinite(prepared.viewportWidth) ||
        !Number.isFinite(prepared.viewportHeight) ||
        prepared.viewportWidth <= 0 ||
        prepared.viewportHeight <= 0 ||
        x >= prepared.viewportWidth ||
        y >= prepared.viewportHeight
      )
        fail("TARGET_NOT_ACTIONABLE");
      const hit = await this.debuggerApi.sendCommand(
        target,
        "DOM.getNodeForLocation",
        {
          x: Math.round(x),
          y: Math.round(y),
          includeUserAgentShadowDOM: false,
        },
      );
      if (!(await this.isTargetOrDescendant(target, hit.nodeId, boundNode)))
        fail("TARGET_NOT_ACTIONABLE");
      const attributes = await this.debuggerApi.sendCommand(
        target,
        "DOM.getAttributes",
        { nodeId: boundNode },
      );
      if (!this.hasToken(attributes.attributes, action.actionToken))
        fail("TARGET_NOT_ACTIONABLE");
      if (
        this.aborted.has(action.tabId) ||
        !this.isGranted(action.capability, action.origin, action.runId)
      )
        fail("PERMISSION_REQUIRED");
      if (action.tool === "click_by_ref") {
        await this.debuggerApi.sendCommand(target, "Input.dispatchMouseEvent", {
          type: "mousePressed",
          x,
          y,
          button: "left",
          clickCount: 1,
        });
        dispatched = true;
        await this.debuggerApi.sendCommand(target, "Input.dispatchMouseEvent", {
          type: "mouseReleased",
          x,
          y,
          button: "left",
          clickCount: 1,
        });
      } else {
        await this.debuggerApi.sendCommand(target, "DOM.focus", {
          nodeId: boundNode,
        });
        if (
          this.aborted.has(action.tabId) ||
          !this.isGranted(action.capability, action.origin, action.runId)
        )
          fail("PERMISSION_REQUIRED");
        if (action.tool === "set_text_by_ref") {
          const selectAll = {
            key: "a",
            code: "KeyA",
            windowsVirtualKeyCode: 65,
            modifiers: 2,
          };
          await this.debuggerApi.sendCommand(target, "Input.dispatchKeyEvent", {
            type: "rawKeyDown",
            ...selectAll,
          });
          dispatched = true;
          await this.debuggerApi.sendCommand(target, "Input.dispatchKeyEvent", {
            type: "keyUp",
            ...selectAll,
          });
          await this.debuggerApi.sendCommand(target, "Input.insertText", {
            text: input?.text,
          });
        } else {
          await this.debuggerApi.sendCommand(target, "Input.dispatchKeyEvent", {
            type: "keyDown",
            key: input?.key,
          });
          dispatched = true;
          await this.debuggerApi.sendCommand(target, "Input.dispatchKeyEvent", {
            type: "keyUp",
            key: input?.key,
          });
        }
      }
      return { dispatched: true, outcome: "DISPATCHED" };
    } catch (error) {
      if (error instanceof ContractError) throw error;
      return { dispatched, outcome: dispatched ? "UNKNOWN" : "FAILED" };
    } finally {
      await this.bridge.clear(action).catch(() => undefined);
      if (attached) await this.cleanupOwned(action.tabId);
      else {
        await this.markers.clear(action.tabId).catch(() => undefined);
      }
      this.active.delete(action.tabId);
      this.aborted.delete(action.tabId);
    }
  }

  private validateAction(
    action: BoundedCdpAction,
    input?: { key?: string; text?: string },
  ): void {
    if (
      Object.keys(action).some((key) => !actionKeys.has(key)) ||
      !["click_by_ref", "press_key_by_ref", "set_text_by_ref"].includes(
        action.tool,
      ) ||
      !["R1", "R2"].includes(action.risk) ||
      (action.tool === "set_text_by_ref"
        ? action.capability !== "type"
        : action.capability !== "click") ||
      typeof action.runId !== "string" ||
      !action.runId ||
      typeof action.actionId !== "string" ||
      !action.actionId ||
      !Number.isInteger(action.tabId) ||
      action.tabId < 0 ||
      action.frameId !== 0 ||
      !action.documentId ||
      !action.documentEpoch ||
      !action.refId ||
      !tokenPattern.test(action.actionToken) ||
      (action.risk === "R2" && !action.confirmationDigest)
    )
      fail("CDP_COMMAND_NOT_ALLOWED");
    if (
      input &&
      Object.keys(input).some((key) => key !== "key" && key !== "text")
    )
      fail("CDP_COMMAND_NOT_ALLOWED");
    if (
      action.tool === "press_key_by_ref" &&
      (!input?.key || !keyCodes.has(input.key))
    )
      fail("CDP_COMMAND_NOT_ALLOWED");
    if (
      action.tool === "set_text_by_ref" &&
      (typeof input?.text !== "string" ||
        input.text.length > 16_384 ||
        input.key !== undefined)
    )
      fail("CDP_COMMAND_NOT_ALLOWED");
    if (
      action.tool === "click_by_ref" &&
      (input?.key !== undefined || input?.text !== undefined)
    )
      fail("CDP_COMMAND_NOT_ALLOWED");
  }

  private hasToken(value: unknown, token: string): boolean {
    if (!Array.isArray(value) || value.length % 2 !== 0) return false;
    for (let index = 0; index < value.length; index += 2)
      if (
        value[index] === "data-contextpilot-action-token" &&
        value[index + 1] === token
      )
        return true;
    return false;
  }

  private async isTargetOrDescendant(
    target: Debuggee,
    hit: unknown,
    boundNode: number,
  ): Promise<boolean> {
    let current = nodeId(hit);
    for (let depth = 0; depth < 16; depth += 1) {
      if (current === boundNode) return true;
      const described = await this.debuggerApi.sendCommand(
        target,
        "DOM.describeNode",
        { nodeId: current, depth: 0, pierce: false },
      );
      const node = described.node as Record<string, unknown> | undefined;
      const parent = node?.parentId;
      if (
        typeof parent !== "number" ||
        !Number.isInteger(parent) ||
        parent <= 0
      )
        return false;
      current = parent;
    }
    return false;
  }

  private attachCode(error: unknown): ErrorCode {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    return message.includes("another debugger") ||
      message.includes("already attached")
      ? "CDP_CONFLICT"
      : "CDP_UNAVAILABLE";
  }
}
