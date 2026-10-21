import type { Receipt } from "../../../../packages/tool-registry/src/contracts.js";
import type { Sqlite } from "../tasks/database.js";
import { transaction } from "../tasks/database.js";
export interface StepState {
  digest: string;
  status: "reserved" | "pending" | "completed" | "failed";
  receipt?: Receipt;
  error?: string;
  uncertain?: boolean;
}
export class McpStepStore {
  constructor(private db: Sqlite) {
    db.exec(
      "CREATE TABLE IF NOT EXISTS mcp_steps (task_id TEXT NOT NULL, call_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(task_id,call_id))",
    );
  }
  reserve(
    taskId: string,
    callId: string,
    digest: string,
  ): { fresh: boolean; state: StepState } {
    return transaction(this.db, () => {
      const row = this.db
        .prepare("SELECT body FROM mcp_steps WHERE task_id=? AND call_id=?")
        .get(taskId, callId);
      if (row) {
        const state = JSON.parse(String(row.body)) as StepState;
        if (state.digest !== digest) throw new Error("MCP_CALL_CONFLICT");
        return { fresh: false, state };
      }
      const previous = this.db
        .prepare("SELECT body FROM mcp_steps WHERE task_id=?")
        .all(taskId)
        .map((r) => JSON.parse(String(r.body)) as StepState);
      if (
        previous.some(
          (s) =>
            s.status === "reserved" ||
            s.status === "pending" ||
            s.uncertain ||
            s.receipt?.dispatch === "unknown",
        )
      )
        throw new Error("MCP_TASK_RECONCILIATION_REQUIRED");
      const count = this.db
        .prepare("SELECT count(*) AS count FROM mcp_steps WHERE task_id=?")
        .get(taskId);
      if (Number(count?.count) >= 64) throw new Error("MCP_STEP_LIMIT");
      const state: StepState = { digest, status: "reserved" };
      this.db
        .prepare("INSERT INTO mcp_steps VALUES (?,?,?)")
        .run(taskId, callId, JSON.stringify(state));
      return { fresh: true, state };
    });
  }
  summary(taskId: string) {
    const states = this.db
      .prepare("SELECT body FROM mcp_steps WHERE task_id=?")
      .all(taskId)
      .map((r) => JSON.parse(String(r.body)) as StepState);
    return {
      dispatchUnknown: states.some(
        (s) =>
          s.status === "reserved" ||
          s.uncertain ||
          s.receipt?.dispatch === "unknown",
      ),
      pendingApprovalOrInput: states.some((s) => s.status === "pending"),
      actionVerified: states.some((s) => s.receipt?.verification === "passed"),
    };
  }
  save(taskId: string, callId: string, state: StepState): void {
    this.db
      .prepare("UPDATE mcp_steps SET body=? WHERE task_id=? AND call_id=?")
      .run(JSON.stringify(state), taskId, callId);
  }
}
