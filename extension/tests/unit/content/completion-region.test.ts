import { afterEach, describe, expect, it, vi } from "vitest";
import { completionRegionDigest } from "../../../src/content/completion-region.js";

class Input {
  public value = "original";
  public disabled = false;
  public checked = false;
  public closest() {
    return null;
  }
}
class OtherInput {}
const region = (controls: Input[]) =>
  ({
    querySelectorAll: (selector: string) =>
      selector === "input,textarea,select" ? controls : [],
  }) as unknown as HTMLElement;
afterEach(() => vi.unstubAllGlobals());
const globals = () => {
  vi.stubGlobal("HTMLInputElement", Input);
  vi.stubGlobal("HTMLTextAreaElement", OtherInput);
  vi.stubGlobal("HTMLSelectElement", OtherInput);
};
describe("bounded local result region evidence", () => {
  it("R03/R06 invalidates changed input values and state even when text is unchanged", () => {
    globals();
    const input = new Input(),
      root = region([input]);
    const before = completionRegionDigest(
      root,
      () => "Same result text",
      () => false,
    );
    input.value = "changed";
    expect(
      completionRegionDigest(
        root,
        () => "Same result text",
        () => false,
      ),
    ).not.toBe(before);
    input.value = "original";
    input.checked = true;
    expect(
      completionRegionDigest(
        root,
        () => "Same result text",
        () => false,
      ),
    ).not.toBe(before);
    expect(before).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(before).not.toContain("original");
  });
  it("R14 refuses complete-region claims for sensitive values and bounded overflow", () => {
    globals();
    const input = new Input();
    input.value = "private credential";
    expect(
      completionRegionDigest(
        region([input]),
        () => "Safe",
        () => true,
      ),
    ).toBeUndefined();
    expect(
      completionRegionDigest(
        region([]),
        () => "x".repeat(12001),
        () => false,
      ),
    ).toBeUndefined();
    expect(
      completionRegionDigest(
        region(Array.from({ length: 129 }, () => new Input())),
        () => "Safe",
        () => false,
      ),
    ).toBeUndefined();
    input.value = "x".repeat(12001);
    expect(
      completionRegionDigest(
        region([input]),
        () => "Safe",
        () => false,
      ),
    ).toBeUndefined();
  });
});
