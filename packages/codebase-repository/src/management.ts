import { decodeAdvisoryHistory } from "./advisory-controls.js";
import {
  managementCommandSchema,
  snapshotSchema,
  type ManagedProfile,
  type AdvisoryItem,
  type ManagementPage,
} from "@contextpilot/codebase-schema";
import { completed, request, key, stores, type Stored } from "./database.js";
import { catalog } from "./advisory-controls.js";
import { advisoryItem, managedProfile } from "./advisory-page.js";
import { manageWrite } from "./management-write.js";
import { scanIndex } from "./management-scan.js";
export class AdvisoryManager {
  constructor(
    private db: IDBDatabase,
    private profileGuard: string,
    private now = Date.now,
    private capacity = 100 * 1024 * 1024,
  ) {
    if (db.name !== `contextpilot-codebase-v1-${profileGuard}`)
      throw Error("MANAGEMENT_PROFILE");
  }
  async request(raw: unknown) {
    const command = managementCommandSchema.parse(raw);
    const deadline = this.now() + 10000;
    const current = () => this.now() < deadline;
    const write = "revision" in command;
    const tx = this.db.transaction(
      [...stores],
      write ? "readwrite" : "readonly",
    );
    const done = completed(tx);
    try {
      if (write) {
        const result = await manageWrite(
          tx,
          command,
          this.now(),
          current,
          this.capacity,
        );
        await done;
        return result;
      }
      const state = await catalog(tx);
      if (command.kind === "advisory.profile") {
        const profile = await managedProfile(
          tx,
          command.scope.partitionId,
          command.scope.pageKey,
          this.now(),
          command.cursor ?? null,
          20,
          current,
        );
        if (!profile) throw Error("ADVISORY_UNAVAILABLE");
        await done;
        return { revision: state.revision, enabled: state.enabled, profile };
      }
      if (command.kind === "advisory.history") {
        const rows = (await request(
          tx
            .objectStore("migrationJournal")
            .index("scopeKind")
            .getAll(
              [command.scope.partitionId, command.scope.pageKey, "advisory"],
              200001,
            ),
        )) as Stored[];
        if (rows.length > 200000) throw Error("CACHE_RECORD_LIMIT");
        const values = rows
          .flatMap((row) => {
            const parsed = decodeAdvisoryHistory(row.value);
            return parsed.success &&
              parsed.data.id === command.id &&
              parsed.data.sourceRevision > command.cursor
              ? [parsed.data]
              : [];
          })
          .sort((a, b) => a.sourceRevision - b.sourceRevision);
        if (!current()) throw Error("MANAGEMENT_EXPIRED");
        await done;
        return {
          revision: state.revision,
          items: values.slice(0, command.limit),
          cursor:
            values.length > command.limit
              ? values[command.limit - 1]!.sourceRevision
              : null,
        };
      }
      if (command.kind === "advisory.profiles") {
        const result: ManagementPage<ManagedProfile> = {
          ...state,
          items: [],
          cursor: null,
          partial: false,
        };
        const scan = await scanIndex(
          tx.objectStore("pages").index("kind"),
          "page",
          command.cursor,
          async (row) => {
            const snapshot = snapshotSchema.parse(row.value);
            if (snapshot.context.profileGuard !== this.profileGuard)
              throw Error("MANAGEMENT_PROFILE");
            const profile = await managedProfile(
              tx,
              row.partitionId,
              row.pageKey,
              this.now(),
              null,
              1,
              current,
            );
            if (
              profile &&
              `${profile.origin} ${profile.name}`
                .toLowerCase()
                .includes(command.filter.toLowerCase())
            )
              result.items.push(profile);
            return result.items.length < command.limit;
          },
          current,
        );
        Object.assign(result, scan);
        await done;
        return result;
      }
      const result: ManagementPage<
        AdvisoryItem & {
          scope: { partitionId: string; pageKey: string };
          origin: string;
        }
      > = { ...state, items: [], cursor: null, partial: false };
      const scan = await scanIndex(
        tx.objectStore("entities").index("kind"),
        "workflow",
        command.cursor,
        async (row) => {
          if (row.expiresAt > this.now()) {
            const item = await advisoryItem(tx, row);
            const page = (await request(
              tx
                .objectStore("pages")
                .get(key(row.partitionId, row.pageKey, "current")),
            )) as Stored | undefined;
            if (page && item?.source === "recorded") {
              const snapshot = snapshotSchema.parse(page.value);
              if (snapshot.context.profileGuard !== this.profileGuard)
                throw Error("MANAGEMENT_PROFILE");
              result.items.push({
                ...item,
                origin: snapshot.context.origin,
                scope: { partitionId: row.partitionId, pageKey: row.pageKey },
              });
            }
          }
          return result.items.length < command.limit;
        },
        current,
      );
      Object.assign(result, scan);
      await done;
      return result;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* already completed */
      }
      await done.catch(() => undefined);
      throw error;
    }
  }
}
