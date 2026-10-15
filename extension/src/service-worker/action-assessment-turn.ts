import { assessmentChat } from "./act-assessment-provider.js";
import {
  actionAssessmentTool,
  controlObservationTool,
} from "./act-assessment-schema.js";
import { ContractError } from "../security/validation.js";
import type { ActStepDependencies } from "./act-step-dependencies.js";
import type { ActSession } from "./act-session-types.js";
import type { ProviderMessage } from "../providers/types.js";
import type { actionObservation } from "./act-assessment-observation.js";
export const actionAssessmentTurn = async (
  dependencies: ActStepDependencies,
  session: ActSession,
  messages: ProviderMessage[],
  observation: ReturnType<typeof actionObservation>,
  deadline: number,
) => {
  messages.push({
    role: "user",
    content: `[UNTRUSTED_ACTION_EVIDENCE]\n${dependencies.serialise(observation.packet)}\n[/UNTRUSTED_ACTION_EVIDENCE]`,
  });
  const response = await assessmentChat(
    dependencies,
    session,
    messages,
    [
      actionAssessmentTool(
        observation.packet.observation_id,
        observation.packet.attempt_id,
        observation.evidenceIds,
      ),
      controlObservationTool,
    ],
    deadline,
  );
  const call = response.tool_calls[0];
  if (
    response.tool_calls.length !== 1 ||
    !call?.id ||
    messages.some((m) => m.tool_call_id === call.id)
  )
    throw new ContractError("INVALID_ARGUMENT");
  messages.push({
    role: "assistant",
    content: response.content,
    tool_calls: response.tool_calls,
  });
  return call;
};
