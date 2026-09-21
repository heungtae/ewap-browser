import { withDeadline } from "../../security/deadline.js";
import { fixedRedactedDiscoveryScanner } from "./fixed-main-scanner.js";
import {
  isMainDiscoveryResult,
  type DiscoveryCandidate,
  type DiscoveryResult,
} from "./discovery-types.js";

type BoundDocument = {
  tabId: number;
  documentId: string;
  documentEpoch: string;
  pageScopeEpoch: string;
};
type Injection = { frameId?: number; documentId?: string; result?: unknown };
type Dependencies = {
  scripting?:
    | {
        executeScript(injection: {
          target: { tabId: number; documentIds: string[] };
          world: "MAIN";
          func: (...args: never[]) => unknown;
          args: unknown[];
        }): Promise<Injection[]>;
      }
    | undefined;
  documentFor(tabId: number): { epoch: string; documentId: string } | undefined;
  scopeFor(
    tabId: number,
  ): { document_epoch: string; page_scope_epoch: string } | undefined;
  now?(): number;
};

const DEADLINE_MS = 300;
const CANDIDATE_TTL_MS = 10 * 60_000;

export const createDiscoveryController = (dependencies: Dependencies) => {
  const active = new Map<number, { generation: string; cancelled: boolean }>();
  const candidates = new Map<string, { expiresAt: number }>();
  const now = () => dependencies.now?.() ?? Date.now();
  const current = (context: BoundDocument): boolean => {
    const document = dependencies.documentFor(context.tabId);
    const scope = dependencies.scopeFor(context.tabId);
    return (
      document?.documentId === context.documentId &&
      document.epoch === context.documentEpoch &&
      scope?.document_epoch === context.documentEpoch &&
      scope.page_scope_epoch === context.pageScopeEpoch
    );
  };
  const empty = (
    terminal: DiscoveryResult["terminal"],
    started: number,
  ): DiscoveryResult => ({
    candidates: [],
    truncated: false,
    terminal,
    duration_ms: Math.max(0, now() - started),
  });
  const start = async (context: BoundDocument): Promise<DiscoveryResult> => {
    const started = now();
    if (!dependencies.scripting || !current(context))
      return empty("STALE", started);
    if (active.has(context.tabId)) return empty("CANCELLED", started);
    const generation = crypto.randomUUID();
    active.set(context.tabId, { generation, cancelled: false });
    try {
      const injected = await withDeadline(
        dependencies.scripting.executeScript({
          target: { tabId: context.tabId, documentIds: [context.documentId] },
          world: "MAIN",
          func: fixedRedactedDiscoveryScanner as never,
          args: [],
        }),
        DEADLINE_MS,
        "REQUEST_TIMEOUT",
      );
      const run = active.get(context.tabId);
      if (!run || run.generation !== generation || run.cancelled)
        return empty("CANCELLED", started);
      if (!current(context)) return empty("STALE", started);
      const only = injected.length === 1 ? injected[0] : undefined;
      if (
        !only ||
        only.frameId !== 0 ||
        only.documentId !== context.documentId ||
        !isMainDiscoveryResult(only.result)
      )
        return empty("MAIN_UNRESPONSIVE", started);
      const result = only.result;
      const publicCandidates: DiscoveryCandidate[] = result.hints.map(
        (hint, index) => {
          const candidateRef = crypto.randomUUID();
          candidates.set(candidateRef, { expiresAt: now() + CANDIDATE_TTL_MS });
          const ordinal = index + 1;
          return {
            candidate_ref: candidateRef,
            kind: hint.kind,
            label:
              hint.kind === "public_js_function_hint"
                ? `Public function hint ${ordinal}`
                : `Inline endpoint hint ${ordinal}`,
            confidence: hint.confidence,
            evidence: hint.evidence,
            limitations: hint.limitations,
          };
        },
      );
      return {
        candidates: publicCandidates,
        truncated: result.truncated,
        terminal: "COMPLETED",
        duration_ms: Math.max(0, now() - started),
      };
    } catch {
      return empty("MAIN_UNRESPONSIVE", started);
    } finally {
      const run = active.get(context.tabId);
      if (run?.generation === generation) active.delete(context.tabId);
      for (const [ref, candidate] of candidates)
        if (candidate.expiresAt <= now()) candidates.delete(ref);
    }
  };
  const cancel = (tabId: number): void => {
    const run = active.get(tabId);
    if (run) run.cancelled = true;
  };
  return { start, cancel };
};
