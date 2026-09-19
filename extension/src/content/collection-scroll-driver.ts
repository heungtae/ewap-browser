import type { CollectionReadDescriptor } from "../contracts/collection-read-types.js";

export type ScrollDriverState = {
  container: Element | null;
  originalScrollTop: number;
  originalScrollLeft: number;
  stepCount: number;
  lastScrollTop: number;
  stableCount: number;
};

export type ScrollStepResult = {
  success: boolean;
  newContent: boolean;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  atBottom: boolean;
  error?: string;
};

let driverState: ScrollDriverState = {
  container: null,
  originalScrollTop: 0,
  originalScrollLeft: 0,
  stepCount: 0,
  lastScrollTop: -1,
  stableCount: 0,
};

const SCROLL_STABILIZE_MS = 300;
const SCROLL_STEP_PX = 400;

function findContainerByXPath(xpath: string): Element | null {
  try {
    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    );
    return result.singleNodeValue as Element | null;
  } catch {
    return null;
  }
}

function isScrollable(element: Element): boolean {
  const style = getComputedStyle(element);
  return (
    style.overflow === "auto" ||
    style.overflow === "scroll" ||
    style.overflowY === "auto" ||
    style.overflowY === "scroll"
  );
}

function waitForMutations(
  container: Element,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve) => {
    let resolved = false;
    const observer = new MutationObserver(() => {
      if (!resolved) {
        resolved = true;
        observer.disconnect();
        resolve();
      }
    });

    observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        "aria-rowindex",
        "aria-posinset",
        "aria-setsize",
        "data-row-id",
      ],
    });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        observer.disconnect();
        resolve();
      }
    }, timeoutMs);
  });
}

export function initializeScrollDriver(descriptor: CollectionReadDescriptor): {
  ok: boolean;
  error?: string;
} {
  const container = findContainerByXPath(descriptor.container_xpath);
  if (!container) {
    return { ok: false, error: "CONTAINER_NOT_FOUND" };
  }

  if (!isScrollable(container)) {
    return { ok: false, error: "CONTAINER_NOT_SCROLLABLE" };
  }

  const scrollableContainer = container as HTMLElement;
  driverState = {
    container: scrollableContainer,
    originalScrollTop: scrollableContainer.scrollTop,
    originalScrollLeft: scrollableContainer.scrollLeft,
    stepCount: 0,
    lastScrollTop: -1,
    stableCount: 0,
  };

  return { ok: true };
}

export async function scrollStep(): Promise<ScrollStepResult> {
  const { container, lastScrollTop } = driverState;

  if (!container || !(container instanceof HTMLElement)) {
    return {
      success: false,
      newContent: false,
      scrollTop: 0,
      scrollHeight: 0,
      clientHeight: 0,
      atBottom: true,
      error: "DRIVER_NOT_INITIALIZED",
    };
  }

  const scrollableContainer = container as HTMLElement;
  const beforeScrollTop = scrollableContainer.scrollTop;
  const scrollHeight = scrollableContainer.scrollHeight;
  const clientHeight = scrollableContainer.clientHeight;

  const targetScrollTop = Math.min(
    beforeScrollTop + SCROLL_STEP_PX,
    scrollHeight - clientHeight,
  );

  scrollableContainer.scrollTop = targetScrollTop;

  await waitForMutations(scrollableContainer, SCROLL_STABILIZE_MS);

  const afterScrollTop = scrollableContainer.scrollTop;
  const atBottom = afterScrollTop >= scrollHeight - clientHeight - 1;

  let newContent = false;
  if (afterScrollTop !== lastScrollTop) {
    newContent = true;
    driverState.stableCount = 0;
  } else {
    driverState.stableCount++;
  }

  driverState.stepCount++;
  driverState.lastScrollTop = afterScrollTop;

  return {
    success: true,
    newContent,
    scrollTop: afterScrollTop,
    scrollHeight,
    clientHeight,
    atBottom,
  };
}

export function restorePosition(): boolean {
  const { container, originalScrollTop, originalScrollLeft } = driverState;

  if (!container || !(container instanceof HTMLElement)) {
    return false;
  }

  try {
    const scrollableContainer = container as HTMLElement;
    scrollableContainer.scrollTop = originalScrollTop;
    scrollableContainer.scrollLeft = originalScrollLeft;
    return true;
  } catch {
    return false;
  }
}

export function getDriverState(): Readonly<ScrollDriverState> {
  return { ...driverState };
}

export function resetScrollDriver(): void {
  driverState = {
    container: null,
    originalScrollTop: 0,
    originalScrollLeft: 0,
    stepCount: 0,
    lastScrollTop: -1,
    stableCount: 0,
  };
}

export function isAtEof(): boolean {
  const { container } = driverState;
  if (!container || !(container instanceof HTMLElement)) return true;

  const scrollableContainer = container as HTMLElement;
  return (
    scrollableContainer.scrollTop >=
    scrollableContainer.scrollHeight - scrollableContainer.clientHeight - 1
  );
}

export function getStepCount(): number {
  return driverState.stepCount;
}
