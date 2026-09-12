import { describe, expect, it } from "vitest";
import {
  failureHelp,
  timelineToolLabel,
} from "../../../src/sidepanel/panel.js";

describe("sidepanel failure help", () => {
  it("directs provider failures to the AI settings connection test", () => {
    expect(failureHelp("PROVIDER_PLUGIN_FAILED")).toEqual({
      guidance:
        "AI 설정에서 연결 테스트를 실행하세요. 계속되면 endpoint, 실행 중인 provider, 선택 모델을 확인해 주세요.",
      openSettings: true,
    });
  });

  it("gives a safe recovery step for unknown failures", () => {
    expect(failureHelp("UNRECOGNISED_FAILURE")).toEqual({
      guidance:
        "같은 문제가 반복되면 확장을 다시 로드한 뒤 다시 시도해 주세요.",
    });
  });

  it("directs a disconnected page to automatic recovery settings", () => {
    expect(failureHelp("DOCUMENT_NOT_REGISTERED")).toEqual({
      guidance:
        "AI 설정에서 페이지 연결 자동 복구 권한을 허용한 뒤 다시 시도해 주세요. 계속되면 현재 페이지를 새로고침해 주세요.",
      openSettings: true,
    });
  });
});

describe("timeline tool labels", () => {
  it("keeps internal mutation identifiers out of the user-facing timeline", () => {
    expect(timelineToolLabel("click_by_ref")).toBe("클릭");
    expect(timelineToolLabel("unknown_internal_tool")).toBe("페이지 작업");
  });

  it("identifies the target for click and navigation events", () => {
    expect(timelineToolLabel("click_by_ref", "Remote")).toBe("Remote 클릭");
    expect(timelineToolLabel("navigate", "SSH Tutorial")).toBe(
      "SSH Tutorial 페이지 이동",
    );
  });
});
