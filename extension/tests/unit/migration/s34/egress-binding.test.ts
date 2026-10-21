import { expect, it, vi } from "vitest";
import {
  AnalysisEngine,
  MemoryAnalysisBudget,
} from "../../../../../packages/analysis-engine/src/index.js";
import { ResponsesAnalyst } from "../../../../../packages/provider-adapters/src/responses/client.js";
import { config, fixture } from "./support.js";
it.each(["task", "consent"])(
  "S34 %s changes while reading the credential prevent actual transport egress",
  async (kind) => {
    const f = await fixture(),
      fetcher = vi.fn<typeof fetch>();
    let current = true,
      authorized = true;
    f.port.authorized = async () => authorized;
    const analyst = new ResponsesAnalyst(
      config,
      async () => {
        if (kind === "task") current = false;
        else authorized = false;
        return "fixture-key";
      },
      fetcher,
    );
    const engine = new AnalysisEngine({
      data: f.port,
      analyst,
      budget: new MemoryAnalysisBudget(f.request.taskId),
      current: () => current,
      now: f.now,
    });
    expect(await engine.run(f.request)).toMatchObject({
      status: "UNAVAILABLE",
      code: kind === "task" ? "ANALYSIS_STALE" : "ANALYSIS_DISCLOSURE_DENIED",
    });
    expect(fetcher).not.toHaveBeenCalled();
  },
);
