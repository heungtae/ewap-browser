import type { ValueBinding, ValueKind } from "../contracts/types.js";
import { digestCanonical, opaqueId } from "../security/canonical.js";
import { fail } from "../security/validation.js";
export type SlotBinding = {
  run_id: string;
  tab_id: number;
  frame_id: number;
  document_epoch: string;
  profile_id: string;
  profile_version: number;
  tool: "set_text_by_ref" | "select_option_by_ref";
  ref_id: string;
  value_kind: ValueKind;
};
type Slot = SlotBinding & { id: string; expiresAt: number; consumed: boolean };
export class ValueSlots {
  private readonly slots = new Map<string, Slot>();
  public create(binding: SlotBinding, now = Date.now()): Slot {
    const slot = {
      ...binding,
      id: opaqueId(),
      expiresAt: now + 5 * 60_000,
      consumed: false,
    };
    this.slots.set(slot.id, slot);
    return slot;
  }
  public validate(
    id: string,
    binding: SlotBinding,
    value: string,
    now = Date.now(),
  ): { binding: ValueBinding; value: string } {
    const slot = this.slots.get(id);
    if (
      !slot ||
      slot.consumed ||
      slot.expiresAt < now ||
      !same(slot, binding) ||
      !validValue(binding.value_kind, value)
    ) {
      this.slots.delete(id);
      return fail("VALUE_BINDING_INVALID");
    }
    return {
      binding: {
        value_slot_id: id,
        value_kind: binding.value_kind,
        value_digest: digestCanonical({
          schema_version: 1,
          ...binding,
          value_slot_id: id,
          value,
        }),
      },
      value,
    };
  }
  public consume(
    id: string,
    binding: SlotBinding,
    value: string,
    now = Date.now(),
  ): { binding: ValueBinding; value: string } {
    const prepared = this.validate(id, binding, value, now);
    const slot = this.slots.get(id);
    if (!slot) return fail("VALUE_BINDING_INVALID");
    slot.consumed = true;
    this.slots.delete(id);
    return prepared;
  }
  public submit(
    id: string,
    binding: SlotBinding,
    value: string,
    now = Date.now(),
  ): { binding: ValueBinding; value: string } {
    return this.consume(id, binding, value, now);
  }
  public clear(): void {
    this.slots.clear();
  }
}
const same = (slot: SlotBinding, binding: SlotBinding): boolean =>
  Object.keys(binding).every(
    (key) =>
      slot[key as keyof SlotBinding] === binding[key as keyof SlotBinding],
  );
const validValue = (kind: ValueKind, value: string): boolean =>
  !value.includes("\0") &&
  [...value].length <= (kind === "text" ? 4096 : 160) &&
  (kind === "text" || !/[\r\n]/.test(value));
