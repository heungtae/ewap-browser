import { describe, expect, it } from "vitest";
import { createExecutionActivityLog } from "../../../src/sidepanel/execution-activity-log.js";
describe("execution activity log", () => {
  it("keeps collection progress and labels streamed provider responses once", () => {
    const log = createExecutionActivityLog();
    log.collection("본문 텍스트 수집");
    log.providerStart("run");
    log.providerResponse("run", "hello");
    log.providerResponse("run", " world");
    expect(log.lines()).toEqual(["본문 텍스트 수집", "ai hello world"]);
    log.providerStart("run");
    log.providerResponse("run", "next");
    expect(log.lines().at(-1)).toBe("ai next");
    log.clear();
    expect(log.lines()).toEqual([]);
  });
  it("bounds the visible execution history and response size", () => {
    const log = createExecutionActivityLog();
    for (let i = 0; i < 60; i++) log.collection(String(i));
    log.providerResponse("run", "x".repeat(5000));
    expect(log.lines()).toHaveLength(50);
    expect(log.lines().at(-1)).toHaveLength(4000);
  });
});
