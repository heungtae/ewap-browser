import { expect, it, vi } from "vitest";
import { delegateAnalysis } from "../../../../../apps/agent-server/src/analysis/delegate.js";
import {
  AnalysisEngine,
  MemoryAnalysisBudget,
  type AnalystPort,
} from "../../../../../packages/analysis-engine/src/index.js";
import { type OrchestrationStore } from "../../../../../packages/task-engine/src/orchestration/contracts.js";
import { planning, step } from "../s33/support.js";
import { fixture, result } from "./support.js";
async function setup(needsData = false, failCommit = false) {
  const f = await fixture();
  const state = step(planning(), "analysis");
  const request = {
    ...f.request,
    taskId: state.context.taskId,
    taskRevision: state.context.taskRevision,
    deadline: state.deadline,
  };
  const analyze = vi
    .fn<AnalystPort["analyze"]>()
    .mockImplementation(async (input) => {
      const r = result(input);
      if (needsData) {
        r.additionalData = [
          {
            datasetId: "dataset_one",
            fields: ["amount"],
            coverage: "complete",
          },
        ];
        r.limitations = ["MORE_DATA_REQUIRED"];
      }
      return { result: r, usage: { inputTokens: 100, outputTokens: 200 } };
    });
  const commit = vi
    .fn<OrchestrationStore["commit"]>()
    .mockImplementation(async () => {
      if (failCommit) throw Error("REVISION_CONFLICT");
    });
  const engine = new AnalysisEngine({
    data: f.port,
    analyst: { analyze },
    budget: new MemoryAnalysisBudget(request.taskId),
    current: () => true,
    now: f.now,
  });
  return { state, request, engine, analyze, commit, now: f.now };
}
it("S34 controlled S33 delegation journals supported findings without completing the task", async () => {
  const f = await setup();
  const result = await delegateAnalysis(
    f.state,
    f.request,
    f.engine,
    { commit: f.commit },
    f.now,
  );
  expect(result.status).toBe("PENDING_CONTROLLER_ACCEPTANCE");
  expect(result.state).toMatchObject({
    phase: "result_acceptance",
    outcome: "PENDING",
  });
  expect(f.commit).toHaveBeenCalledTimes(1);
  expect(f.analyze).toHaveBeenCalledTimes(1);
});
it("S34 additional-data requests return to planning for JEV and cannot dispatch browser work", async () => {
  const f = await setup(true);
  const result = await delegateAnalysis(
    f.state,
    f.request,
    f.engine,
    { commit: f.commit },
    f.now,
  );
  expect(result).toMatchObject({
    status: "CONTROLLER_DATA_REQUEST",
    state: { phase: "planning", outcome: "PENDING" },
  });
});
it("S34 stale task/phase admission makes zero analyst calls", async () => {
  const f = await setup();
  await expect(
    delegateAnalysis(
      f.state,
      { ...f.request, taskRevision: 0 },
      f.engine,
      { commit: f.commit },
      f.now,
    ),
  ).rejects.toThrow("ANALYSIS_TASK_BINDING");
  await expect(
    delegateAnalysis(
      { ...f.state, phase: "planning" },
      f.request,
      f.engine,
      { commit: f.commit },
      f.now,
    ),
  ).rejects.toThrow("ANALYSIS_TASK_BINDING");
  expect(f.analyze).not.toHaveBeenCalled();
});
it("S34 concurrent Stop/revision changes prevent publication after a supported provider result", async () => {
  const f = await setup(false, true);
  await expect(
    delegateAnalysis(f.state, f.request, f.engine, { commit: f.commit }, f.now),
  ).rejects.toThrow("REVISION_CONFLICT");
  expect(f.analyze).toHaveBeenCalledTimes(1);
});
