# Browser Agent S35 — MCP gateway and external integration adapters

**Status: Planned. Created: 2026-10-18. Implementation: not started.**

Owner: Integration maintainer. Migration slice: M09. Prerequisites: [S31](s31-durable-task-recovery.md), [S33](s33-jev-task-orchestration.md), [S34](s34-gpt-evidence-analysis.md).

Design: [refactoring](../architecture/web-codebase-agent-refactoring.md), [construction](../architecture/web-codebase-construction.md), [runtime contracts](../architecture/web-codebase-runtime-contracts.md). Parent phase and metric definitions: [migration plan](../architecture/web-codebase-agent-migration-plan.md).

## Objective and entry boundary

Expose the same durable runtime to real Codex/Claude clients and migrate existing profile/workflow/Business MCP/PDP/audit/Studio integrations behind explicit versioned adapters.

All prerequisite runtime/evidence gates must pass before this Sprint is marked complete. Planning or read-only preparation does not satisfy a runtime dependency. Current behavior remains defined by implementation and dated evidence.

## Change boundary

Refactoring units: **RF14, RF19, RF21, RF22, RF26**. Current sources: [profile/business-mcp-client.ts](../../extension/src/profile/business-mcp-client.ts), [profile/resolver.ts](../../extension/src/profile/resolver.ts), [policy/enterprise-policy.ts](../../extension/src/policy/enterprise-policy.ts), [studio/validation.ts](../../extension/src/studio/validation.ts).

Planned destinations/deliverables: `apps/mcp-server/`, backend task/tool API and `packages/integration-adapters/`.

Preserve current Side Panel/Options/profile-manager presentation structure, explicit consent, Ask/Act boundaries, fresh target binding and dispatch uncertainty. Do not edit unrelated work, introduce an undeclared second executor, or claim external/OS/live success from fixtures.

## Implementation cards

All cards are Planned. Execute as reviewable changes with the listed regression checks; no product implementation is authorized merely by creating this Sprint.

| ID     | Change                                                                                                                                                                                                       | Acceptance / linked checks                                                                                                                                       |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S35-C1 | **Implement authenticated local MCP gateway.** Add stdio MCP entrypoint, paired local IPC, per-client profile/site/tab/mode/tool scopes and negotiated schemas.                                              | No default network listener or direct Chrome/content connection; arbitrary client identity cannot access another profile. Checks: S35-R01.                       |
| S35-C2 | **Add high-level durable execution.** Implement agent.execute_request plus status/cancel with task handle, progress and pending-approval outcomes.                                                           | JEV remains controller; disconnected MCP session does not destroy task state or imply approval. Checks: S35-R02.                                                 |
| S35-C3 | **Add scoped low-level tools.** Expose canonical registry tools only for explicit external-controller mode, with the same prepared-step/policy/receipt pipeline.                                             | External callers cannot mint evidence/approval or bypass task.complete/analysis validation. Checks: S35-R03.                                                     |
| S35-C4 | **Migrate existing integration consumers.** Adapt signed profiles/workflow imports, outbound Business MCP, enterprise deny, audit and Studio recording/preview without changing original envelopes silently. | Every consumer has a supported version or explicit incompatibility; retain dated Platform C01–C09 backlog and original signature/replay checks. Checks: S35-R04. |
| S35-C5 | **Qualify real clients and failure paths.** Run actual Codex CLI and Claude Code discovery/call/result continuation, asynchronous status/approval and cancellation.                                          | Real semantic tool usage and shared enforcement are evidenced; mocked JSON/HTTP success cannot pass. Checks: S35-R05, S35-R06.                                   |

## Verification scenarios

| ID      | Scenario                | Expected evidence                                                                                                                                |
| ------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| S35-R01 | Client isolation        | Wrong pairing/profile/tool scope and unrelated tab/data enumeration reject before dispatch or disclosure.                                        |
| S35-R02 | High-level durability   | Disconnect/reconnect during JEV execution and pending UI approval; status/cancel remain correct without implied approval.                        |
| S35-R03 | Low-level policy parity | Forged approval, stale prepared ref, analyst browser arguments and false task completion fail identically to internal calls.                     |
| S35-R04 | Adapter compatibility   | Tampered signature, replayed profile, unsupported workflow step, proprietary Business MCP mismatch and enterprise deny remain explicit failures. |
| S35-R05 | Codex interoperability  | Real client sees negotiated schemas, invokes tools and consumes result continuation; trace links task/approval/dispatch/evidence.                |
| S35-R06 | Claude interoperability | Real client exercises high-level and scoped low-level modes, pending approval and cancel with the same semantic outcomes.                        |

Card references R01–R06 correspond to the zero-padded scenario IDs in this table.

## Completion and evidence

MCP contract/IPC/scope tests, integration adapter regressions, controlled browser approval flow, real Codex and Claude client sessions; separate actual Platform evidence.

Record results in a dated file under `docs/evidence/` named for S35; create it when checks actually run. Include source revision/dirty caveat, app/schema/model/client/OS versions, exact commands, first failures, recovery, approval and dispatch counts, coverage, terminal result and UI evidence where relevant.

Completion requires all S35-C cards and S35-R scenarios, passing applicable boundaries and a linked evidence record. Update this document, the Sprint index and progress ledger together. Until then keep status Planned or In Progress; documentation checks are not implementation evidence.

## Rollback and handoff

Remove gateway exposure/registration, revoke client sessions and cancel/drain owned tasks. Preserve original integration settings/envelopes and all dispatch receipts.

All external routes are accounted for before S36/S37 retirement; unresolved external compatibility is not relabeled as local success.
