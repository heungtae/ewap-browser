import { replaySchema } from "@contextpilot/shared/bridge";
import { z } from "zod";
import { api } from "./api.js";
import type { SettingsClient, TaskClient } from "@contextpilot/shared/bridge";
async function request(value: unknown): Promise<unknown> {
  if (!api) throw new Error("BACKEND_UNAVAILABLE");
  const result = await api.runtime.sendMessage(value);
  const response = z
    .strictObject({ ok: z.literal(true), result: z.unknown() })
    .parse(result);
  return response.result;
}
export const tasks: TaskClient = {
  resume: async (afterSequence) =>
    replaySchema.parse(await request({ kind: "resumeEvents", afterSequence })),
};
export const settings: SettingsClient = {
  read: async () => {
    await request({ kind: "capabilities" });
    return {
      controllerReady: false,
      analystReady: false,
      secretMode: "session-only",
    };
  },
};
