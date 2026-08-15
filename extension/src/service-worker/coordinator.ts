import type {
  ModelActionProposal,
  ModelSemanticSnapshot,
  SemanticSnapshot,
} from "../contracts/types.js";
import { opaqueId } from "../security/canonical.js";
import { fail } from "../security/validation.js";
import { exactOrigin, type PolicyBundle } from "../security/origin-matcher.js";
import { RunCoordinator } from "../state/run-coordinator.js";
import { MutationCoordinator } from "../state/mutation-coordinator.js";
export class ServiceCoordinator {
  public readonly runs = new RunCoordinator();
  public readonly mutations = new MutationCoordinator(this.runs);
  private ready = false;
  public constructor(private readonly policy: PolicyBundle) {}
  public completeStorageBootstrap(succeeded: boolean): void {
    this.ready = succeeded;
  }
  public preview(
    tabId: number,
    frameId: number,
    epoch: string,
    origin: string,
    snapshot: SemanticSnapshot,
  ): SemanticSnapshot {
    if (!this.ready) return fail("STORAGE_BOUNDARY_UNAVAILABLE");
    if (!exactOrigin(origin, this.policy.page_read_origins))
      return fail("ORIGIN_NOT_ALLOWED");
    this.cancel(tabId);
    const run = this.runs.start(tabId, frameId, epoch, "ask");
    this.runs.terminal(run.id, "VERIFIED");
    return snapshot;
  }
  public startProtected(tabId: number, frameId: number, epoch: string): never {
    if (!this.ready) return fail("STORAGE_BOUNDARY_UNAVAILABLE");
    this.cancel(tabId);
    this.runs.start(tabId, frameId, epoch, "act");
    return fail("PROFILE_UNAVAILABLE");
  }
  public cancel(tabId: number): void {
    const run = this.runs.get(tabId);
    if (run && run.phase !== "TERMINAL")
      this.mutations.terminal(run, "CANCELLED");
  }
  public invalidateDocument(tabId: number, epoch: string): void {
    const run = this.runs.get(tabId);
    if (run && run.documentEpoch !== epoch)
      this.mutations.terminal(run, "CANCELLED");
  }
  public modelSnapshot(
    runId: string,
    snapshot: SemanticSnapshot,
  ): {
    snapshot: ModelSemanticSnapshot;
    resolve(proposal: ModelActionProposal): string;
  } {
    if (!this.runs.byId(runId)) return fail("INVALID_ARGUMENT");
    const map = new Map<string, string>();
    const refs = new Map(
      snapshot.nodes.map((node) => [node.ref_id, opaqueId()]),
    );
    const nodes = snapshot.nodes.map((node) => {
      const modelRef = refs.get(node.ref_id);
      if (!modelRef) return fail("INTERNAL_FAILURE");
      const parent = node.parent_ref_id
        ? refs.get(node.parent_ref_id)
        : undefined;
      const label = node.label_ref_id ? refs.get(node.label_ref_id) : undefined;
      map.set(modelRef, node.ref_id);
      return {
        model_ref: modelRef,
        role: node.role,
        name: node.name,
        state: node.state,
        visible: node.visible,
        enabled: node.enabled,
        ...(parent ? { parent_model_ref: parent } : {}),
        ...(label ? { label_model_ref: label } : {}),
      };
    });
    return {
      snapshot: {
        document_epoch: snapshot.document_epoch,
        frame_id: snapshot.frame_id,
        nodes,
      },
      resolve: (proposal) => {
        const ref = map.get(proposal.target);
        if (!ref) return fail("INVALID_ARGUMENT");
        map.delete(proposal.target);
        return ref;
      },
    };
  }
}
