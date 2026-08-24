import { exactKeys } from "./runtime-message-router.js";
import type { BrowserSender } from "./browser-api.js";

type Respond = (response: unknown) => void;
type WorkflowRecord = {
  id: string;
  title: string;
  enabled: boolean;
  declaration: { title: string };
  updated_at: string;
};
type Catalog = { records: WorkflowRecord[] };
type Dependencies = {
  isPanelOrSettingsSender(sender: BrowserSender): boolean;
  isSettingsSender(sender: BrowserSender): boolean;
  loadCatalog(): Promise<Catalog>;
  saveCatalog(catalog: Catalog): Promise<void>;
  safeFailure(code: string): unknown;
};

export const createWorkflowCatalogMessageHandler = (
  dependencies: Dependencies,
) => ({
  handle(
    message: object,
    sender: BrowserSender,
    respond: Respond,
  ): { handled: boolean; keepAlive?: boolean } {
    const kind = (message as { kind?: unknown }).kind;
    if (kind === "WORKFLOW_CATALOG_LIST") {
      if (
        !dependencies.isPanelOrSettingsSender(sender) ||
        !exactKeys(message, ["kind"])
      ) {
        respond(dependencies.safeFailure("INVALID_ARGUMENT"));
        return { handled: true };
      }
      void dependencies
        .loadCatalog()
        .then((catalog) => respond({ ok: true, records: catalog.records }))
        .catch(() =>
          respond(dependencies.safeFailure("STORAGE_BOUNDARY_UNAVAILABLE")),
        );
      return { handled: true, keepAlive: true };
    }
    if (kind !== "WORKFLOW_CATALOG_UPDATE") return { handled: false };
    const operation = (message as { operation?: unknown }).operation;
    const id = (message as { id?: unknown }).id;
    const title = (message as { title?: unknown }).title;
    const enabled = (message as { enabled?: unknown }).enabled;
    if (
      !dependencies.isSettingsSender(sender) ||
      !exactKeys(message, ["kind", "operation", "id", "title", "enabled"]) ||
      !["rename", "set_enabled", "delete"].includes(operation as string) ||
      typeof id !== "string" ||
      typeof title !== "string" ||
      typeof enabled !== "boolean"
    ) {
      respond(dependencies.safeFailure("INVALID_ARGUMENT"));
      return { handled: true };
    }
    void dependencies
      .loadCatalog()
      .then(async (catalog) => {
        const index = catalog.records.findIndex((item) => item.id === id);
        if (index < 0)
          return respond(dependencies.safeFailure("INVALID_ARGUMENT"));
        if (operation === "delete") catalog.records.splice(index, 1);
        else {
          const current = catalog.records[index]!;
          catalog.records[index] = {
            ...current,
            ...(operation === "rename"
              ? {
                  title: title.slice(0, 160),
                  declaration: {
                    ...current.declaration,
                    title: title.slice(0, 160),
                  },
                }
              : { enabled }),
            updated_at: new Date().toISOString(),
          };
        }
        await dependencies.saveCatalog(catalog);
        respond({ ok: true, records: catalog.records });
      })
      .catch(() =>
        respond(dependencies.safeFailure("STORAGE_BOUNDARY_UNAVAILABLE")),
      );
    return { handled: true, keepAlive: true };
  },
});
