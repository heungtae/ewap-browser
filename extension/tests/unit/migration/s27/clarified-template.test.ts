import { expect, it } from "vitest";
import {
  acceptResult,
  createFrame,
  nativeRequest,
} from "../../../../../packages/task-engine/src/decisions/index.js";
import { frame, response } from "./support.js";

it("keeps the original question and binds the clarified question to v2", () => {
  const old = frame(undefined, "semantic_selection");
  const { digest: _digest, ...payload } = old;
  const current = createFrame({ ...payload, templateVersion: "controller-v2" });
  expect(nativeRequest(old).questions.decision.instructions).not.toContain(
    "explicitly stated current subgoal",
  );
  expect(nativeRequest(current).questions.decision.instructions).toContain(
    "explicitly stated current subgoal",
  );
  expect(() => acceptResult(current, response(old))).toThrow(
    "FOREIGN_OR_STALE_RESULT",
  );
});

it("accepts a valid selection even when evidence sufficiency is below 0.9", () => {
  const old = frame();
  const { digest: _digest, ...payload } = old;
  const current = createFrame({ ...payload, templateVersion: "controller-v2" });
  const result = response(current);
  result.answers.evidence_sufficient.noul = 0.6;
  expect(acceptResult(current, result)).toMatchObject({
    outcome: "SELECTED",
    selection: "search",
  });
});
