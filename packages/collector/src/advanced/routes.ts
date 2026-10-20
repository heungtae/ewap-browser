import { canonical } from "@contextpilot/codebase-schema";
export interface NavigationBinding {
  tabId: number;
  frameId: number;
  documentId: string;
  documentEpoch: number;
  routeEpoch: number;
  profileId: string;
  partitionId: string;
}
export class NavigationTracker {
  private binding: NavigationBinding;
  constructor(
    binding: NavigationBinding,
    private invalidate: () => void,
  ) {
    this.binding = structuredClone(binding);
  }
  snapshot() {
    return structuredClone(this.binding);
  }
  current(binding: NavigationBinding): boolean {
    return canonical(binding) === canonical(this.binding);
  }
  // Called only by authenticated browser navigation events, never page-supplied identity.
  observe(event: {
    tabId: number;
    frameId: number;
    documentId: string;
    kind: "document" | "route";
  }): void {
    if (
      event.tabId !== this.binding.tabId ||
      event.frameId !== this.binding.frameId
    )
      return;
    if (event.kind === "route" && event.documentId !== this.binding.documentId)
      throw new Error("NAVIGATION_STALE");
    if (event.kind === "document") {
      this.binding.documentId = event.documentId;
      this.binding.documentEpoch++;
    }
    this.binding.routeEpoch++;
    this.invalidate();
  }
}
