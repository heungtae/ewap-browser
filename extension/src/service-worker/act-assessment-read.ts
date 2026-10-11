import { consumeAssessment } from "./act-assessment-budget.js";
import { withDeadline } from "../security/deadline.js";
import type { ActStepDependencies } from "./act-step-dependencies.js";
import type { ActSession } from "./act-session-types.js";
export const readAdditionalAction = async (
  dependencies: ActStepDependencies,
  session: ActSession,
  step: string,
) => {
  const deadline = consumeAssessment(session, "action", step, true);
  await withDeadline(
    new Promise<void>((resolve) => setTimeout(resolve, 200)),
    Math.max(0, deadline - Date.now()),
    "REQUEST_TIMEOUT",
  );
  return withDeadline(
    dependencies.readActive(undefined, session.tabId),
    Math.max(0, deadline - Date.now()),
    "REQUEST_TIMEOUT",
  );
};
