import { initializeLearnedProfileManagement } from "./learned-profile-management.js";

const runtime = (
  globalThis as typeof globalThis & {
    chrome?: { runtime: { sendMessage(message: unknown): Promise<unknown> } };
  }
).chrome?.runtime;
if (runtime) initializeLearnedProfileManagement(runtime);
