import { bytes } from "@contextpilot/codebase-schema";
import {
  requestSchema,
  type AnalysisRequest,
  type AnalystPort,
} from "./contracts.js";
import { resolveInput, type DataPort } from "./resolve.js";
import { validateResult } from "./validate-result.js";
import type { BudgetStore } from "./budget.js";
export class AnalysisEngine {
  constructor(
    private ports: {
      data: DataPort;
      analyst: AnalystPort;
      budget: BudgetStore;
      current(request: AnalysisRequest): boolean;
      now(): number;
    },
  ) {}
  async run(raw: AnalysisRequest, signal?: AbortSignal) {
    const request = requestSchema.parse(raw);
    const abort = new AbortController();
    const forward = () => abort.abort();
    signal?.addEventListener("abort", forward, { once: true });
    if (signal?.aborted) forward();
    const assertCurrent = () => {
      if (abort.signal.aborted) throw new Error("ANALYSIS_CANCELLED");
      if (this.ports.now() >= request.deadline)
        throw new Error("ANALYSIS_TIMEOUT");
      if (!this.ports.current(request)) throw new Error("ANALYSIS_STALE");
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      assertCurrent();
      const work = async () => {
        const input = await resolveInput(
          request,
          this.ports.data,
          this.ports.now,
          abort.signal,
        );
        assertCurrent();
        await this.ports.budget.reserve(request.taskId, bytes(input));
        assertCurrent();
        const beforeSend = async () => {
          assertCurrent();
          const fresh = await resolveInput(
            request,
            this.ports.data,
            this.ports.now,
            abort.signal,
          );
          assertCurrent();
          if (fresh.inputDigest !== input.inputDigest)
            throw new Error("ANALYSIS_STALE");
        };
        const reply = await this.ports.analyst.analyze(
          structuredClone(input),
          abort.signal,
          beforeSend,
        );
        const counters = await this.ports.budget.settle(
          request.taskId,
          reply.usage,
        );
        assertCurrent();
        const fresh = await resolveInput(
          request,
          this.ports.data,
          this.ports.now,
          abort.signal,
        );
        assertCurrent();
        if (fresh.inputDigest !== input.inputDigest)
          throw new Error("ANALYSIS_STALE");
        const supported = validateResult(input, reply.result);
        return { ...supported, inputDigest: input.inputDigest, counters };
      };
      const interrupted = new Promise<never>((_resolve, reject) => {
        abort.signal.addEventListener(
          "abort",
          () =>
            reject(
              new Error(
                signal?.aborted ? "ANALYSIS_CANCELLED" : "ANALYSIS_TIMEOUT",
              ),
            ),
          { once: true },
        );
        timer = setTimeout(
          () => abort.abort(),
          Math.max(1, Math.min(30000, request.deadline - this.ports.now())),
        );
      });
      return await Promise.race([work(), interrupted]);
    } catch (error) {
      abort.abort();
      const code =
        error instanceof Error && /^ANALYSIS_[A-Z0-9_]+$/.test(error.message)
          ? error.message
          : "ANALYSIS_INVALID_RESULT";
      const state = await this.ports.budget.fail(request.taskId, code);
      return {
        status: "UNAVAILABLE" as const,
        code,
        firstFailure: state.firstFailure,
      };
    } finally {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", forward);
    }
  }
}
