import { createLearnedIdentity } from "../learned-profile/identity.js";
import { createLearnedProfileStore } from "../learned-profile/store.js";
import { createLearnedSession } from "../learned-profile/session.js";
import { chromeApi } from "./runtime-platform.js";
import type { ActivePage } from "./page-context-runtime.js";
const local = chromeApi?.storage.local;
const storage =
  local?.get && local.set
    ? {
        get: local.get.bind(local),
        set: local.set.bind(local),
        ...(local.setAccessLevel
          ? { setAccessLevel: local.setAccessLevel.bind(local) }
          : {}),
      }
    : undefined;
export const learnedProfileStore = storage
  ? createLearnedProfileStore(storage)
  : undefined;
const identity = storage ? createLearnedIdentity(storage) : undefined;
export async function beginLearnedProfile(
  active: ActivePage,
  mode: "ask" | "act",
  current: () => boolean,
  notify?: (
    status: "REUSED" | "SAVED" | "FALLBACK" | "STORE_FAILED" | "REPAIRED",
  ) => void,
) {
  if (!identity || !learnedProfileStore || !current()) return undefined;
  try {
    if (!(await learnedProfileStore.snapshot()).enabled || !current())
      return undefined;
    const match = await identity.match(active);
    if (!match || !current()) return undefined;
    const ticket = await learnedProfileStore.lookup(match);
    return ticket && current()
      ? createLearnedSession({
          ticket,
          store: learnedProfileStore,
          mode,
          current,
          snapshot: active.snapshot,
          ...(active.url ? { url: active.url } : {}),
          ...(notify ? { notify } : {}),
        })
      : undefined;
  } catch {
    return undefined;
  }
}
