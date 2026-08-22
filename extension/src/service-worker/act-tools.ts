import type { ModelSemanticSnapshot } from "../contracts/types.js";
import type { ProviderToolDefinition } from "../providers/types.js";

const demoOptions: Record<string, readonly string[]> = {
  제품군: ["AI 가속기", "차량용 플랫폼", "모바일 SoC"],
  "공정 노드": ["2nm GAA", "3nm FinFET", "5nm FinFET"],
  "생산 캠퍼스": ["평택 Campus 3", "화성 Campus 2", "청주 Campus 1"],
  "분석 기간": ["최근 12주", "최근 8주", "최근 4주"],
};
const demoSubmitName = "수율 추세 분석 실행";
const demoOpenAnalysisName = "분석 센터 열기";

export const demoActTools = (
  snapshot: ModelSemanticSnapshot,
  options: { allowAnalysisNavigation?: boolean } = {},
): ProviderToolDefinition[] => {
  const selectTargets = snapshot.nodes
    .filter(
      (node) =>
        node.visible &&
        node.enabled &&
        node.role === "combobox" &&
        demoOptions[node.name],
    )
    .map((node) => node.model_ref);
  const clickTargets = snapshot.nodes
    .filter(
      (node) =>
        node.visible &&
        node.enabled &&
        ((node.role === "button" && node.name === demoSubmitName) ||
          (options.allowAnalysisNavigation &&
            node.role === "link" &&
            node.name === demoOpenAnalysisName)),
    )
    .map((node) => node.model_ref);
  const optionValues = [...new Set(Object.values(demoOptions).flat())];
  return [
    ...(selectTargets.length
      ? [
          {
            type: "function" as const,
            function: {
              name: "propose_select_option",
              description:
                "Propose one option for the next enabled semiconductor analysis combobox. This is not execution. target must be an opaque model_ref from the target enum.",
              parameters: {
                type: "object",
                additionalProperties: false,
                properties: {
                  target: { type: "string", enum: selectTargets },
                  value: { type: "string", enum: optionValues },
                },
                required: ["target", "value"],
              },
            },
          },
        ]
      : []),
    ...(clickTargets.length
      ? [
          {
            type: "function" as const,
            function: {
              name: "propose_click",
              description:
                "Propose one enabled semiconductor demo control. This is not execution. target must be an opaque model_ref from the target enum.",
              parameters: {
                type: "object",
                additionalProperties: false,
                properties: {
                  target: { type: "string", enum: clickTargets },
                },
                required: ["target"],
              },
            },
          },
        ]
      : []),
  ];
};
