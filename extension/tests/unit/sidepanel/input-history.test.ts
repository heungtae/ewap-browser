import { describe, expect, it } from "vitest";
import { InputHistory } from "../../../src/sidepanel/input-history.js";

describe("InputHistory", () => {
  it("navigates submitted messages and restores the draft", () => {
    const history = new InputHistory();
    history.add("첫 질문");
    history.add("두 번째 질문");

    expect(history.previous("작성 중인 초안")).toBe("두 번째 질문");
    expect(history.previous("두 번째 질문")).toBe("첫 질문");
    expect(history.next()).toBe("두 번째 질문");
    expect(history.next()).toBe("작성 중인 초안");
    expect(history.next()).toBeUndefined();
  });

  it("does not duplicate consecutive messages", () => {
    const history = new InputHistory();
    history.add("같은 질문");
    history.add("같은 질문");
    expect(history.previous("")).toBe("같은 질문");
    expect(history.previous("")).toBe("같은 질문");
  });
});
