import { z } from "zod";
import {
  managementCommandSchema,
  profilesPageSchema,
  profileResultSchema,
  workflowsPageSchema,
  historyPageSchema,
  advisoryCatalogSchema,
  type ManagementCommand,
} from "@contextpilot/codebase-schema";
import { api } from "../bridge/api.js";
const response = z.strictObject({ ok: z.literal(true), result: z.unknown() });
export function createAdvisoryClient(
  send: (value: ManagementCommand) => Promise<unknown> = (value) => {
    if (!api) throw Error("UNAVAILABLE");
    return api.runtime.sendMessage(value);
  },
) {
  async function call<T>(
    command: ManagementCommand,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const checked = managementCommandSchema.safeParse(command);
    if (!checked.success) throw Error("요청 형식이 올바르지 않습니다.");
    let raw: unknown;
    try {
      raw = await send(checked.data);
    } catch {
      throw Error(
        "Backend disconnected — 로컬 참고 기록에 연결하지 못했습니다.",
      );
    }
    if (
      raw &&
      typeof raw === "object" &&
      (raw as { error?: string }).error === "MANAGEMENT_STALE"
    )
      throw Error("목록이 변경되었습니다. 새로 고침 후 다시 시도하세요.");
    const parsed = response.safeParse(raw);
    if (!parsed.success)
      throw Error("Backend disconnected — 로컬 참고 기록을 확인해 주세요.");
    const result = schema.safeParse(parsed.data.result);
    if (!result.success) throw Error("참고 기록 응답을 확인할 수 없습니다.");
    return result.data;
  }
  return {
    profiles: (cursor: string | null, filter = "") =>
      call(
        { kind: "advisory.profiles", cursor, filter, limit: 10 },
        profilesPageSchema,
      ),
    profile: (
      scope: { partitionId: string; pageKey: string },
      cursor: string | null = null,
    ) => call({ kind: "advisory.profile", scope, cursor }, profileResultSchema),
    workflows: (cursor: string | null) =>
      call(
        { kind: "advisory.workflows", cursor, limit: 20 },
        workflowsPageSchema,
      ),
    history: (
      scope: { partitionId: string; pageKey: string },
      id: string,
      cursor = 0,
    ) =>
      call(
        { kind: "advisory.history", scope, id, cursor, limit: 20 },
        historyPageSchema,
      ),
    change: (command: Extract<ManagementCommand, { revision: number }>) =>
      call(command, advisoryCatalogSchema),
  };
}
export type AdvisoryClient = ReturnType<typeof createAdvisoryClient>;
