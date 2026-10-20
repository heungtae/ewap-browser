export interface DirtyObserverPort {
  active(): boolean;
  markStale(): void;
  markRoot(root: string, now: number): void;
  flush(now: number): void;
}
export function observeDirty(
  root: Element,
  port: DirtyObserverPort,
  now: () => number = Date.now,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let first: number | undefined;
  const observer = new MutationObserver((records) => {
    if (!port.active()) {
      port.markStale();
      return;
    }
    first ??= now();
    // A burst is a bounded root invalidation, never a body capture or model call.
    const capped = records.length > 128;
    for (let i = 0; i < Math.min(records.length, 128); i++) {
      const target = records[i]!.target;
      const element =
        target.nodeType === 1 ? (target as Element) : target.parentElement;
      port.markRoot(
        capped || !element
          ? "page_root"
          : (element.getAttribute("data-codebase-root") ?? "page_root"),
        now(),
      );
    }
    clearTimeout(timer);
    timer = setTimeout(
      () => {
        if (port.active()) port.flush(now());
        else port.markStale();
        first = undefined;
      },
      Math.max(0, Math.min(250, first + 1000 - now())),
    );
  });
  observer.observe(root, {
    attributes: true,
    childList: true,
    subtree: true,
    characterData: true,
  });
  return () => {
    clearTimeout(timer);
    observer.disconnect();
  };
}
