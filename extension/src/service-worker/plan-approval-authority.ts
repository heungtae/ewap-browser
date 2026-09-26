import type { PermissionMode } from "../policy/permission-mode.js";

/** A Panel plan choice may approve only the origin of its live Act session. */
export const mayApprovePlan = (
  mode: PermissionMode,
  sessions: ReadonlyMap<string, { origin: string }>,
  sessionId: string,
  origins: readonly string[],
): boolean => {
  const session = sessions.get(sessionId);
  return (
    mode === "follow_a_plan" &&
    !!session &&
    origins.length === 1 &&
    origins[0] === session.origin
  );
};
