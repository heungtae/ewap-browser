import { observeDirty } from "../../../../packages/collector/src/index.js";
import { DirtyRoots } from "../../../../packages/codebase-builder/src/index.js";
export async function runDirtyObserver() {
  const root = document.createElement("section");
  document.body.append(root);
  const dirty = new DirtyRoots(10, "page_root"),
    kinds: string[] = [];
  let live = true,
    marks = 0,
    stale = 0,
    done: (() => void) | undefined;
  const stop = observeDirty(root, {
    active: () => live,
    markStale() {
      stale++;
    },
    markRoot(id, now) {
      marks++;
      dirty.mark(id, now);
    },
    flush(now) {
      const value = dirty.flush(now);
      kinds.push(value.kind);
      if (value.kind === "unstable") live = false;
      done?.();
      done = undefined;
    },
  });
  try {
    for (let burst = 0; burst < 3; burst++)
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(Error("DIRTY_OBSERVER_STALLED")),
          2000,
        );
        done = () => {
          clearTimeout(timeout);
          resolve();
        };
        for (let i = 0; i < 200; i++)
          root.setAttribute("data-change", String(burst * 200 + i));
      });
    if (kinds.join(",") !== "full,full,unstable" || marks > 384 || live)
      throw Error("DIRTY_OBSERVER_LIMIT");
    root.textContent = "after stop";
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (stale !== 1 || kinds.length !== 3) throw Error("DIRTY_OBSERVER_STALE");
    return {
      actualMutationObserver: true,
      fullRebuilds: 2,
      unstableStops: true,
      boundedMarks: marks,
      staleMutationDenied: true,
    };
  } finally {
    stop();
    root.remove();
  }
}
