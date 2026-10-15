import { actModelJudgment } from "./act-model-judgment.js";
import { ContractError, isPlainObject } from "../security/validation.js";
import { opaqueId } from "../security/canonical.js";
import { consumeAssessment } from "./act-assessment-budget.js";
import { assessmentChat } from "./act-assessment-provider.js";
import {
  elementAssessmentTool,
  parseElementAssessment,
} from "./act-element-assessment.js";
import { controlObservationTool } from "./act-assessment-schema.js";
import type {
  ProviderMessage,
  ProviderToolDefinition,
} from "../providers/types.js";
import type { ActStepDependencies } from "./act-step-dependencies.js";
import type { ActSession } from "./act-session-types.js";

export const runElementAssessment = async (opts: {
  dependencies: ActStepDependencies;
  session: ActSession;
  messages: ProviderMessage[];
  tools: ProviderToolDefinition[];
  observationId: string;
  projection?: unknown;
  stepId: string;
  refresh(
    deadline: number,
  ): Promise<{ projection: unknown; tools: ProviderToolDefinition[] }>;
}) => {
  let { tools, observationId } = opts;
  let projection = opts.projection;
  for (let round = 0; ; round++) {
    const deadline = consumeAssessment(opts.session, "element", opts.stepId);
    const native = projection
      ? await actModelJudgment(
          opts.dependencies,
          opts.session,
          "element_assessment",
          {
            observation_id: observationId,
            projection,
            capabilities: tools.map((t) => t.function.name),
          },
          {
            unsupported:
              "The supplied executor capabilities cannot perform the requested operation.",
            unknown:
              "The supplied public control evidence does not establish support.",
            primary:
              "A supported action, new arguments, expected observation or further investigation is needed.",
          },
          deadline,
        )
      : undefined;
    if (native && ["unsupported", "unknown"].includes(native.verdict))
      return {
        nativeSummary:
          native.verdict === "unsupported"
            ? "현재 제공된 기능으로 이 요소의 요청 동작을 지원하지 않습니다."
            : "현재 자료로 이 요소의 동작 지원 여부를 확인하지 못했습니다.",
        response: { content: "", tool_calls: [] },
        tools,
        observationId,
      };
    const response = await assessmentChat(
      opts.dependencies,
      opts.session,
      opts.messages,
      [elementAssessmentTool(observationId, tools), controlObservationTool],
      deadline,
    );
    const call = response.tool_calls[0];
    if (
      response.tool_calls.length !== 1 ||
      !call?.id ||
      opts.messages.some((m) => m.tool_call_id === call.id)
    )
      throw new ContractError("INVALID_ARGUMENT");
    let needsData = false;
    if (call.name === "read_control_observation") {
      const args: unknown = JSON.parse(call.arguments);
      if (!isPlainObject(args) || Object.keys(args).length)
        throw new ContractError("INVALID_ARGUMENT");
      needsData = true;
    } else if (call.name === "assess_element") {
      needsData =
        parseElementAssessment(call, observationId, tools).needsData === true;
    } else throw new ContractError("INVALID_ARGUMENT");
    if (!needsData || round >= 1) return { response, tools, observationId };
    const readDeadline = consumeAssessment(
      opts.session,
      "element",
      opts.stepId,
      true,
    );
    const fresh = await opts.refresh(readDeadline);
    tools = fresh.tools;
    projection = fresh.projection;
    observationId = opaqueId();
    opts.messages.push(
      {
        role: "assistant",
        content: response.content,
        tool_calls: response.tool_calls,
      },
      {
        role: "tool",
        tool_call_id: call.id,
        content: `[UNTRUSTED_CONTROL_OBSERVATION]\n${opts.dependencies.serialise({ observation_id: observationId, projection: fresh.projection, capabilities: tools })}\n[/UNTRUSTED_CONTROL_OBSERVATION]`,
      },
    );
  }
};
