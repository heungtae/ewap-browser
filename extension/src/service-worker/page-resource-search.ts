import type { PageResourceInventory } from "../contracts/page-resource-types.js";
import type { createPageResourceStore } from "./page-resource-store.js";
import type { createPageResourceProgress } from "./page-resource-progress.js";
export const executePageResourceSearch = async (
  resources: ReturnType<typeof createPageResourceStore>,
  name: string,
  args: Record<string, unknown>,
  data: PageResourceInventory,
  progress: ReturnType<typeof createPageResourceProgress>,
) => {
  const { namespace, grants, stores, load, state, cursor, position } =
    resources;
  const search = name === "search_page_resources";
  if (
    search &&
    (typeof args.query !== "string" || !args.query || args.query.length > 512)
  )
    throw new Error("INVALID_QUERY");
  const size = args.page_size ?? (search ? 8 : 20);
  if (
    typeof size !== "number" ||
    !Number.isInteger(size) ||
    size < 1 ||
    size > (search ? 8 : 50)
  )
    throw new Error("INVALID_PAGE_SIZE");
  const key = `${namespace}:${data.revision}:${search ? args.query : "list"}`;
  const offset =
    args.cursor === undefined
      ? ((args.offset as number | undefined) ?? 0)
      : position(args.cursor, name, key);
  const page = data.items.slice(offset, offset + size);
  const next =
    offset + page.length < data.items.length
      ? cursor(name, offset + page.length, key)
      : null;
  const continuation = next
    ? {
        continuation: {
          tool: name,
          arguments: {
            ...(search ? { query: args.query } : {}),
            cursor: next,
            page_size: size,
          },
        },
      }
    : {};
  if (!search)
    return {
      status: "AVAILABLE",
      revision: data.revision,
      items: page.map((item) => ({
        ...item,
        state: !item.readable
          ? "UNSUPPORTED"
          : item.kind === "page_description" ||
              grants.get(item.resource_id) === true
            ? "AVAILABLE"
            : grants.get(item.resource_id) === false
              ? "DENIED"
              : "CONSENT_REQUIRED",
      })),
      next_cursor: next,
      ...continuation,
      progress: progress.record(
        data.revision,
        key,
        page.map((item) => ({ ...item, available: true })),
        data.total_count,
        data.truncated,
      ),
      coverage: {
        total_count: data.total_count,
        supplied_count: page.length,
        complete: offset === 0 && !next && !data.truncated,
        truncated: Boolean(next) || data.truncated,
      },
    };
  await load(
    page.filter((item) => item.readable).map((item) => item.resource_id),
  );
  const hits: Array<Record<string, unknown>> = [];
  const unavailable: Array<{ resource_id: string; status: string }> = [];
  for (const item of page) {
    const store = stores.get(item.resource_id);
    if (!store) {
      unavailable.push({
        resource_id: item.resource_id,
        status: state(item.resource_id),
      });
      continue;
    }
    const index = store.body.indexOf(args.query as string);
    if (index >= 0)
      hits.push({
        resource_id: item.resource_id,
        resource_revision: store.revision,
        byte_space: "masked_utf8",
        byte_offset: new TextEncoder().encode(store.body.slice(0, index))
          .length,
        byte_end: new TextEncoder().encode(
          store.body.slice(0, index + (args.query as string).length),
        ).length,
        excerpt: store.body.slice(Math.max(0, index - 80), index + 120),
      });
  }
  return {
    status:
      unavailable.length === page.length && unavailable.length
        ? "INCOMPLETE"
        : "AVAILABLE",
    hits,
    unavailable,
    next_cursor: next,
    ...continuation,
    progress: progress.record(
      data.revision,
      key,
      page.map((item) => ({
        resource_id: item.resource_id,
        available: stores.has(item.resource_id),
      })),
      data.total_count,
      data.truncated,
    ),
    coverage: {
      scope: "first_match_per_resource",
      supplied_count: page.length,
      total_count: data.total_count,
      complete: offset === 0 && !next && !data.truncated && !unavailable.length,
      truncated: Boolean(next) || data.truncated,
    },
  };
};
