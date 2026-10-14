import { isPlainObject } from "../security/validation.js";
import type { DomainMessageHandler } from "./domain-message-router.js";
import { learnedProfileStore } from "./learned-profile-runtime.js";
import { pageSenderContext } from "./runtime-platform.js";
export const learnedProfileMessageHandler: DomainMessageHandler = {
  handle(message, sender, respond) {
    if (!isPlainObject(message) || message.kind !== "LEARNED_PROFILE_MANAGE")
      return { handled: false };
    if (
      !pageSenderContext.isSettingsSender(sender) &&
      !pageSenderContext.isLearnedProfileManagerSender(sender)
    ) {
      respond({ ok: false, code: "POLICY_DENIED" });
      return { handled: true };
    }
    const work = async () => {
      if (!learnedProfileStore) throw new Error("UNSUPPORTED");
      if (
        Object.keys(message).some(
          (k) =>
            ![
              "kind",
              "operation",
              "revision",
              "profile_id",
              "patch",
              "offset",
              "limit",
              "filter",
            ].includes(k),
        )
      )
        throw new Error("INVALID_ARGUMENT");
      if (message.operation === "list" || message.operation === "get") {
        const catalog = await learnedProfileStore.snapshot();
        if (message.operation === "get")
          return {
            ok: true,
            catalog_revision: catalog.catalog_revision,
            profile: catalog.records.find(
              (p) => p.profile_id === message.profile_id,
            ),
          };
        const offset = message.offset ?? 0,
          limit = message.limit ?? 10;
        if (
          typeof offset !== "number" ||
          !Number.isInteger(offset) ||
          offset < 0 ||
          typeof limit !== "number" ||
          !Number.isInteger(limit) ||
          limit < 1 ||
          limit > 20 ||
          (message.filter !== undefined &&
            (typeof message.filter !== "string" || message.filter.length > 80))
        )
          throw new Error("INVALID_ARGUMENT");
        const records = catalog.records.filter(
          (p) =>
            !message.filter ||
            `${p.page_match.origin} ${p.name}`
              .toLowerCase()
              .includes((message.filter as string).toLowerCase()),
        );
        return {
          ok: true,
          enabled: catalog.enabled,
          catalog_revision: catalog.catalog_revision,
          total: records.length,
          records: records.slice(offset, offset + limit),
        };
      }
      const operation = message.operation;
      if (
        !["feature", "clear", "delete", "update", "rediscover"].includes(
          String(operation),
        ) ||
        !Number.isInteger(message.revision) ||
        (message.profile_id !== undefined &&
          typeof message.profile_id !== "string")
      )
        throw new Error("INVALID_ARGUMENT");
      const patch = message.patch;
      if (
        patch !== undefined &&
        (!isPlainObject(patch) ||
          Object.keys(patch).some(
            (k) =>
              ![
                "enabled",
                "auto_update",
                "name",
                "notes",
                "recipe_id",
              ].includes(k),
          ) ||
          (patch.enabled !== undefined && typeof patch.enabled !== "boolean") ||
          (patch.auto_update !== undefined &&
            typeof patch.auto_update !== "boolean") ||
          (patch.name !== undefined &&
            (typeof patch.name !== "string" || patch.name.length > 80)) ||
          (patch.notes !== undefined &&
            (typeof patch.notes !== "string" || patch.notes.length > 500)) ||
          (patch.recipe_id !== undefined &&
            typeof patch.recipe_id !== "string"))
      )
        throw new Error("INVALID_ARGUMENT");
      const c = await learnedProfileStore.manage(
        message.revision as number,
        operation as "feature" | "clear" | "delete" | "update" | "rediscover",
        message.profile_id as string | undefined,
        patch as
          | {
              enabled?: boolean;
              auto_update?: boolean;
              name?: string;
              notes?: string;
              recipe_id?: string;
            }
          | undefined,
      );
      return {
        ok: true,
        enabled: c.enabled,
        catalog_revision: c.catalog_revision,
      };
    };
    void work().then(respond, () =>
      respond({ ok: false, code: "LEARNED_PROFILE_MANAGEMENT_FAILED" }),
    );
    return { handled: true, keepAlive: true };
  },
};
