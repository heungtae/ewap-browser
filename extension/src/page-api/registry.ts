import { validatePageApiAdapter } from "../contracts/page-api-validation.js";
import type {
  PageApiAction,
  PageApiAdapter,
} from "../contracts/page-api-types.js";
import { fixturePageApiAdapter } from "./adapters/fixture.js";

export class PageApiRegistry {
  public constructor(
    private readonly adapters: readonly PageApiAdapter[] = [
      fixturePageApiAdapter,
    ],
  ) {
    adapters.forEach(validatePageApiAdapter);
  }

  public find(origin: string, path: string): PageApiAdapter | undefined {
    return this.adapters.find(
      (adapter) =>
        adapter.origins.includes(origin) && adapter.matchesPath(path),
    );
  }

  public action(
    origin: string,
    path: string,
    adapterId: string,
    version: number,
    actionId: string,
  ): { adapter: PageApiAdapter; action: PageApiAction } | undefined {
    const adapter = this.find(origin, path);
    if (
      !adapter ||
      adapter.adapter_id !== adapterId ||
      adapter.version !== version
    )
      return undefined;
    const action = adapter.actions.find((item) => item.action_id === actionId);
    return action ? { adapter, action } : undefined;
  }
}

export const pageApiRegistry = new PageApiRegistry();
