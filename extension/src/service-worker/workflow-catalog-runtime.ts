import {
  emptyWorkflowCatalog,
  recordCandidate,
  recordMatchesPage,
  validateWorkflowCatalogState,
  type WorkflowCandidate,
  type WorkflowCatalogState,
} from "../contracts/workflow-catalog.js";
import type { WorkflowDeclaration } from "../contracts/workflow.js";
import type { SemanticSnapshot } from "../contracts/types.js";
import { semanticFingerprint } from "../profile/fingerprint.js";

export type CandidateDefinition = {
  candidate: WorkflowCandidate;
  declaration: WorkflowDeclaration;
};
type Dependencies = {
  get(key: string): Promise<Record<string, unknown> | undefined>;
  set(value: Record<string, unknown>): Promise<void>;
  createId(): string;
};
const storageKey = "saved_workflows_v1";

export const createWorkflowCatalogRuntime = (dependencies: Dependencies) => {
  const load = async (): Promise<WorkflowCatalogState> => {
    const stored = await dependencies.get(storageKey);
    const value = stored?.[storageKey];
    if (value === undefined) return emptyWorkflowCatalog();
    try {
      return validateWorkflowCatalogState(value);
    } catch {
      return emptyWorkflowCatalog();
    }
  };
  const save = async (catalog: WorkflowCatalogState): Promise<void> =>
    dependencies.set({ [storageKey]: catalog });
  const runtimeCandidate = (
    declaration: WorkflowDeclaration,
    active: { origin: string; path: string },
    runtimeKind: "page-declared" | "code-analysis",
  ): CandidateDefinition => ({
    candidate: {
      id: dependencies.createId(),
      source: "runtime",
      runtime_kind: runtimeKind,
      title: declaration.title,
      origin: active.origin,
      path_prefix: active.path,
      step_count: declaration.steps.length,
      status: runtimeKind === "page-declared" ? "verified" : "draft",
      detail:
        runtimeKind === "page-declared"
          ? "이 페이지가 제공한 작업 순서"
          : "페이지 코드 분석 초안 · 이번 실행만 사용 가능",
    },
    declaration,
  });
  const profileCandidate = (
    declaration: WorkflowDeclaration,
    active: { origin: string; path: string },
    profile: { id: string; version: number },
  ): CandidateDefinition => ({
    candidate: {
      id: dependencies.createId(),
      source: "profile",
      title: declaration.title,
      origin: active.origin,
      path_prefix: active.path,
      step_count: declaration.steps.length,
      status: "verified",
      detail: `조직 검증됨 · ${profile.id} v${profile.version}`,
    },
    declaration,
  });
  const collect = async (
    active: {
      origin: string;
      path: string;
      snapshot: SemanticSnapshot;
      workflow?: WorkflowDeclaration;
    },
    profile:
      | { id: string; version: number; workflow?: WorkflowDeclaration }
      | undefined,
  ): Promise<CandidateDefinition[]> => {
    const result: CandidateDefinition[] = [];
    if (profile?.workflow)
      result.push(profileCandidate(profile.workflow, active, profile));
    const catalog = await load();
    for (const item of catalog.records) {
      if (
        item.origin !== active.origin ||
        !active.path.startsWith(item.path_prefix)
      )
        continue;
      const status = recordMatchesPage(
        item,
        active.origin,
        active.path,
        active.snapshot,
      )
        ? "verified"
        : "stale";
      result.push({
        candidate: recordCandidate(item, status),
        declaration: item.declaration,
      });
    }
    if (active.workflow)
      result.push(runtimeCandidate(active.workflow, active, "page-declared"));
    return result;
  };
  const record = async (
    declaration: WorkflowDeclaration,
    active: { origin: string; path: string; snapshot: SemanticSnapshot },
    title: string,
  ): Promise<WorkflowCandidate> => {
    const catalog = await load();
    const now = new Date().toISOString();
    const id = dependencies.createId();
    const savedTitle = title.slice(0, 160) || declaration.title;
    const saved = {
      id,
      title: savedTitle,
      enabled: true,
      origin: active.origin,
      path_prefix: active.path,
      fingerprint: semanticFingerprint(active.snapshot).fingerprint,
      created_at: now,
      updated_at: now,
      declaration: { ...declaration, id, title: savedTitle },
    };
    catalog.records.push(saved);
    await save(catalog);
    return recordCandidate(saved, "verified");
  };
  return { load, save, runtimeCandidate, collect, record };
};
