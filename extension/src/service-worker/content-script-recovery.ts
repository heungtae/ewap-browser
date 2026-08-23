type BrowserPermissions = {
  contains(query: { permissions: string[] }): Promise<boolean>;
};

type BrowserScripting = {
  executeScript(injection: {
    target: { tabId: number };
    files: string[];
  }): Promise<unknown>;
};

/**
 * Recovers only a missing content-script receiver. Normal page reads keep the
 * static content script and never take this path. Concurrent requests for the
 * same tab share one injection so a recovery cannot duplicate page observers.
 */
export class ContentScriptRecovery {
  private readonly inFlight = new Map<number, Promise<boolean>>();

  public constructor(
    private readonly permissions: BrowserPermissions | undefined,
    private readonly scripting: BrowserScripting | undefined,
  ) {}

  public recover(tabId: number): Promise<boolean> {
    const existing = this.inFlight.get(tabId);
    if (existing) return existing;
    const recovery = this.inject(tabId).finally(() => {
      this.inFlight.delete(tabId);
    });
    this.inFlight.set(tabId, recovery);
    return recovery;
  }

  private async inject(tabId: number): Promise<boolean> {
    if (!this.permissions || !this.scripting) return false;
    try {
      if (!(await this.permissions.contains({ permissions: ["scripting"] })))
        return false;
      await this.scripting.executeScript({
        target: { tabId },
        files: ["js/content.js"],
      });
      return true;
    } catch {
      return false;
    }
  }
}
