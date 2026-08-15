import { describe, expect, it } from "vitest";
import { collectSemanticProjection } from "../../../src/content/semantic-collector.js";
import { RefRegistry } from "../../../src/content/ref-registry.js";
describe("semantic collector", () => {
  it("given_password_and_textbox_when_collecting_then_password_is_excluded", () => {
    const registry = new RefRegistry("abcdefghijklmnop", 0);
    const result = collectSemanticProjection(
      [
        {
          isConnected: true,
          role: "textbox",
          name: "Customer",
          visible: true,
          enabled: true,
        },
        {
          isConnected: true,
          role: "textbox",
          name: "Password",
          visible: true,
          enabled: true,
          autocomplete: "current-password",
        },
      ],
      registry,
    );
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]?.name).toBe("Customer");
  });
  it("given_changed_element_when_resolving_then_stale", () => {
    const registry = new RefRegistry("abcdefghijklmnop", 0);
    const element = {
      isConnected: true,
      role: "button" as const,
      name: "Save",
      visible: true,
      enabled: true,
    };
    const id = registry.register(element);
    element.name = "Submit";
    expect(() => registry.resolve(id, "abcdefghijklmnop")).toThrow(
      "TARGET_STALE",
    );
  });
});
