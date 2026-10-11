import { describe, expect, it } from "vitest";
import { ariaBooleanState } from "../../../src/content/boolean-state.js";
describe("public ARIA boolean observation", () => {
  it.each(["selected", "expanded", "pressed"] as const)(
    "preserves unknown %s instead of inventing false",
    (field) => {
      const element = (value: string | null) =>
        ({ getAttribute: () => value }) as unknown as Element;
      expect(ariaBooleanState(element("true"), field)).toEqual({
        [field]: true,
      });
      expect(ariaBooleanState(element("false"), field)).toEqual({
        [field]: false,
      });
      for (const value of [null, "mixed", "", "FALSE", "page instructions"])
        expect(ariaBooleanState(element(value), field)).toEqual({});
    },
  );
});
