import { opaqueId } from "../security/canonical.js";
import type { Role, SemanticNode } from "../contracts/types.js";
import { fail } from "../security/validation.js";

export type ElementLike = {
  isConnected: boolean;
  role: Role;
  name: string;
  visible: boolean;
  enabled: boolean;
};
type RefRecord = {
  element: ElementLike;
  role: Role;
  name: string;
  epoch: string;
};
export class RefRegistry {
  private readonly records = new Map<string, RefRecord>();
  public constructor(
    public readonly epoch: string,
    public readonly frameId: number,
  ) {}
  public register(element: ElementLike): string {
    const ref = opaqueId();
    this.records.set(ref, {
      element,
      role: element.role,
      name: element.name,
      epoch: this.epoch,
    });
    return ref;
  }
  public resolve(refId: string, epoch: string): ElementLike {
    const record = this.records.get(refId);
    if (
      !record ||
      record.epoch !== epoch ||
      !record.element.isConnected ||
      record.element.role !== record.role ||
      record.element.name !== record.name
    )
      return fail("TARGET_STALE");
    return record.element;
  }
  public clear(): void {
    this.records.clear();
  }
  public node(refId: string, state: SemanticNode["state"] = {}): SemanticNode {
    const element = this.resolve(refId, this.epoch);
    return {
      ref_id: refId,
      role: element.role,
      name: element.name,
      state,
      visible: element.visible,
      enabled: element.enabled,
    };
  }
}
