import type { ProviderMessage } from "../providers/types.js";
import { safeChatText } from "../state/tab-chat-session-store.js";
import type { ActSession } from "./act-session-types.js";

type Input = {
  session: ActSession;
  profileContext: string | undefined;
  projection: string;
  threadContext: ProviderMessage[];
  analysisContext?: string;
  harnessBlock?: string;
};

export const actStepMessages = ({
  session,
  profileContext,
  projection,
  threadContext,
  analysisContext,
  harnessBlock,
}: Input): ProviderMessage[] =>
  session.workflow && !session.workflowCompleted
    ? [
        session.messages.at(0)!,
        ...(profileContext
          ? [{ role: "user" as const, content: profileContext }]
          : []),
        {
          role: "user",
          content: `Workflow step ${session.workflow.count + 1}/${session.workflow.declaration.steps.length}. Propose exactly one call to the supplied tool for this fixed current step. For option selection, choose exactly one supplied enum value. Do not repeat a previous tool call or target. User execution request: ${safeChatText(session.prompt)}`,
        },
        // PAH-9/R3: clarification questions and their answers live in
        // session.messages; the fixed-step instruction above must not drop
        // them or the model never sees the user's answer on retry turns.
        ...session.messages.slice(1),
        ...(analysisContext
          ? [{ role: "user" as const, content: analysisContext }]
          : []),
        { role: "user", content: projection },
      ]
    : [
        session.messages.at(0)!,
        ...(profileContext
          ? [{ role: "user" as const, content: profileContext }]
          : []),
        ...threadContext,
        ...session.messages.slice(1),
        ...(analysisContext
          ? [{ role: "user" as const, content: analysisContext }]
          : []),
        { role: "user", content: projection },
        ...(harnessBlock
          ? [{ role: "user" as const, content: harnessBlock }]
          : []),
      ];
