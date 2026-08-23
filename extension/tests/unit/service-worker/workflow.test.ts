import { describe, expect, it } from "vitest";
import {
  nextWorkflowStep,
  validateWorkflowDeclaration,
  workflowTarget,
  workflowTargetsMatchSnapshot,
} from "../../../src/contracts/workflow.js";

const snapshot = {
  schema_version: 2 as const,
  document_epoch: "abcdefghijklmnop",
  frame_id: 0,
  visible_text: "",
  nodes: [
    {
      ref_id: "product-abcdefghijklmnop",
      role: "combobox" as const,
      name: "제품군",
      state: { selected: true },
      visible: true,
      enabled: true,
    },
    {
      ref_id: "process-abcdefghijklmnop",
      role: "combobox" as const,
      name: "공정 노드",
      state: {},
      visible: true,
      enabled: true,
    },
  ],
};

describe("declarative Act workflow", () => {
  it("uses a declared option branch only after the current page state is read", () => {
    const workflow = validateWorkflowDeclaration({
      schema_version: 1,
      id: "yield-v1",
      title: "수율 추세 분석",
      steps: [
        {
          id: "product",
          tool: "select_option_by_ref",
          target: { role: "combobox", name: "제품군" },
          branches: [
            {
              when: { kind: "last_option_equals", value: "AI 가속기" },
              next: "process",
            },
          ],
        },
        {
          id: "process",
          tool: "select_option_by_ref",
          target: { role: "combobox", name: "공정 노드" },
        },
      ],
    });
    const first = workflow.steps[0]!;

    expect(workflowTarget(snapshot, first.target)?.ref_id).toBe(
      "product-abcdefghijklmnop",
    );
    expect(nextWorkflowStep(workflow, first, "AI 가속기", snapshot)?.id).toBe(
      "process",
    );
    expect(nextWorkflowStep(workflow, first, "차량용 플랫폼", snapshot)).toBe(
      undefined,
    );
  });

  it("evaluates a declared boolean branch from a disabled visible control", () => {
    const workflow = validateWorkflowDeclaration({
      schema_version: 1,
      id: "branch-v1",
      title: "분기",
      steps: [
        {
          id: "product",
          tool: "select_option_by_ref",
          target: { role: "combobox", name: "제품군" },
          branches: [
            {
              when: {
                kind: "target_state",
                target: { role: "combobox", name: "공정 노드" },
                field: "enabled",
                expected: false,
              },
              next: "fallback",
            },
          ],
        },
        {
          id: "fallback",
          tool: "click_by_ref",
          target: { role: "button", name: "다시 시도" },
        },
      ],
    });
    const first = workflow.steps[0]!;
    const disabledProcess = {
      ...snapshot,
      nodes: [snapshot.nodes[0]!, { ...snapshot.nodes[1]!, enabled: false }],
    };

    expect(
      nextWorkflowStep(workflow, first, undefined, disabledProcess)?.id,
    ).toBe("fallback");
  });

  it("rejects selectors and missing branch targets", () => {
    expect(() =>
      validateWorkflowDeclaration({
        schema_version: 1,
        id: "bad",
        title: "bad",
        steps: [
          {
            id: "one",
            tool: "click_by_ref",
            target: { role: "button", name: "Save", selector: "#save" },
            next: "missing",
          },
        ],
      }),
    ).toThrow();
  });

  it("matches every declared target by exact visible role and name", () => {
    const workflow = validateWorkflowDeclaration({
      schema_version: 1,
      id: "target-match-v1",
      title: "대상 확인",
      steps: [
        {
          id: "product",
          tool: "select_option_by_ref",
          target: { role: "combobox", name: "제품군" },
        },
      ],
    });
    expect(workflowTargetsMatchSnapshot(snapshot, workflow)).toBe(true);
    expect(
      workflowTargetsMatchSnapshot(
        snapshot,
        validateWorkflowDeclaration({
          ...workflow,
          steps: [
            {
              ...workflow.steps[0]!,
              target: { role: "combobox", name: "제품군 선택" },
            },
          ],
        }),
      ),
    ).toBe(false);
  });

  it("rejects disconnected workflow steps", () => {
    expect(() =>
      validateWorkflowDeclaration({
        schema_version: 1,
        id: "disconnected-v1",
        title: "연결되지 않음",
        steps: [
          {
            id: "first",
            tool: "click_by_ref",
            target: { role: "button", name: "실행" },
          },
          {
            id: "unreachable",
            tool: "click_by_ref",
            target: { role: "button", name: "다시 시도" },
          },
        ],
      }),
    ).toThrow();
  });
});
