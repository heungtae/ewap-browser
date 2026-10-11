import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkedState,
  executeChecked,
} from "../../../src/content/checked-control.js";

class Button {
  isConnected = true;
  disabled = false;
  attrs = new Map<string, string>([
    ["role", "radio"],
    ["aria-checked", "false"],
  ]);
  click = vi.fn(() => this.attrs.set("aria-checked", "true"));
  getAttribute(name: string) {
    return this.attrs.get(name) ?? null;
  }
  matches() {
    return this.disabled;
  }
  closest() {
    return null;
  }
}
class Input extends Button {
  constructor() {
    super();
    this.attrs.set("role", "checkbox");
  }
  type = "checkbox";
  checked = false;
  indeterminate = false;
  override click = vi.fn(() => {
    this.checked = !this.checked;
  });
}
const element = (button: Button) => button as unknown as HTMLButtonElement;
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("bounded checked controls", () => {
  const setup = () => {
    vi.stubGlobal("HTMLButtonElement", Button);
    vi.stubGlobal("HTMLInputElement", Input);
  };
  it("selects a radio once and treats an already satisfied state as a no-op", async () => {
    setup();
    const button = new Button();
    expect(checkedState(element(button))).toEqual({ checked: false });
    expect(await executeChecked(element(button), true, () => true)).toEqual({
      ok: true,
      postcondition: "semantic",
      dispatch: "dispatched",
    });
    expect(
      await executeChecked(element(button), true, () => true),
    ).toMatchObject({ dispatch: "not_dispatched", already_satisfied: true });
    expect(button.click).toHaveBeenCalledTimes(1);
  });
  it("observes delayed state without repeating the click", async () => {
    setup();
    vi.useFakeTimers();
    const button = new Button();
    button.click = vi.fn(() => {
      setTimeout(() => button.attrs.set("aria-checked", "true"), 100);
      return button.attrs;
    });
    const result = executeChecked(element(button), true, () => true);
    await vi.advanceTimersByTimeAsync(150);
    expect(await result).toEqual({
      ok: true,
      postcondition: "semantic",
      dispatch: "dispatched",
    });
    expect(button.click).toHaveBeenCalledTimes(1);
  });
  it("does not coerce mixed state, mutate disabled controls, or uncheck radio", async () => {
    setup();
    const button = new Button();
    button.attrs.set("aria-checked", "mixed");
    expect(checkedState(element(button))).toEqual({});
    expect((await executeChecked(element(button), true, () => true)).ok).toBe(
      false,
    );
    button.attrs.set("aria-checked", "true");
    expect((await executeChecked(element(button), false, () => true)).ok).toBe(
      false,
    );
    button.disabled = true;
    expect((await executeChecked(element(button), true, () => true)).ok).toBe(
      false,
    );
    expect(button.click).not.toHaveBeenCalled();
  });
  it("preserves native toggling and excludes indeterminate state", async () => {
    setup();
    const input = new Input();
    expect((await executeChecked(element(input), true, () => true)).ok).toBe(
      true,
    );
    expect((await executeChecked(element(input), false, () => true)).ok).toBe(
      true,
    );
    input.indeterminate = true;
    expect(checkedState(element(input))).toEqual({});
  });
  it("rejects detached or invalidated bindings without further mutation", async () => {
    setup();
    vi.useFakeTimers();
    const button = new Button();
    button.click = vi.fn(() => {
      button.isConnected = false;
      return button.attrs;
    });
    expect(await executeChecked(element(button), true, () => true)).toEqual({
      ok: false,
      code: "TARGET_STALE",
      dispatch: "dispatched",
    });
    expect(button.click).toHaveBeenCalledTimes(1);
    button.isConnected = true;
    expect((await executeChecked(element(button), true, () => false)).ok).toBe(
      false,
    );
    expect(button.click).toHaveBeenCalledTimes(1);
  });
  it("does not report success when state never changes", async () => {
    setup();
    vi.useFakeTimers();
    const button = new Button();
    button.click = vi.fn(() => button.attrs);
    const result = executeChecked(element(button), true, () => true);
    await vi.advanceTimersByTimeAsync(1600);
    expect((await result).ok).toBe(false);
    expect(button.click).toHaveBeenCalledTimes(1);
  });
});
