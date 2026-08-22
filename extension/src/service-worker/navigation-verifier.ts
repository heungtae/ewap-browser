export type NavigationTab = { url?: string };

const pause = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * A navigation is successful only after the browser reports the exact trusted
 * origin and path. Query strings and fragments are not part of this contract.
 */
export const waitForExactNavigation = async (
  readTab: () => Promise<NavigationTab>,
  expected: { origin: string; pathname: string },
  attempts = 20,
  intervalMs = 50,
): Promise<boolean> => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const tab = await readTab();
      if (typeof tab.url === "string") {
        const url = new URL(tab.url);
        if (
          url.origin === expected.origin &&
          url.pathname === expected.pathname &&
          url.search === "" &&
          url.hash === ""
        )
          return true;
      }
    } catch {
      return false;
    }
    if (attempt + 1 < attempts) await pause(intervalMs);
  }
  return false;
};
