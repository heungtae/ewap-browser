import { digestCanonical, opaqueId } from "../security/canonical.js";
import type { PageResourceInventory } from "../contracts/page-resource-types.js";

// Static source only. URLs never leave this content-local inventory.
export const createPageResourceCollector = (doc: Document, epoch: string) => {
  const ids = new WeakMap<HTMLScriptElement, string>();
  const descriptionId = opaqueId();
  const encoder = new TextEncoder();
  const collect = async () => {
    const scripts = Array.from(doc.scripts);
    const description =
      `${doc.title}\n${doc.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? ""}`.slice(
        0,
        4096,
      );
    let collectedBytes = 0;
    const records = await Promise.all(
      scripts.slice(0, 256).map(async (node) => {
        let id = ids.get(node);
        if (!id) {
          id = opaqueId();
          ids.set(node, id);
        }
        const src = node.src;
        const rawBody = src ? "" : (node.textContent ?? "");
        const length = rawBody.length;
        const candidate = rawBody.slice(0, 1024 * 1024);
        const width = encoder.encode(candidate).length;
        const bounded =
          length <= 1024 * 1024 &&
          width <= 1024 * 1024 &&
          collectedBytes + width <= 4 * 1024 * 1024;
        const body = bounded ? candidate : candidate.slice(0, 1024);
        if (bounded) collectedBytes += width;
        const url = src ? new URL(src, doc.baseURI) : undefined;
        const readable = url
          ? url.origin === new URL(doc.URL).origin &&
            ["http:", "https:"].includes(url.protocol) &&
            !url.username &&
            !url.password &&
            !url.search &&
            !url.hash
          : bounded;
        return {
          resource_id: id,
          revision: src
            ? await digestCanonical({ src })
            : await digestCanonical({ body }),
          kind: src ? ("external_script" as const) : ("inline_script" as const),
          byte_length: src || !bounded ? null : width,
          readable,
          body,
          src,
        };
      }),
    );
    const entries = [
      {
        resource_id: descriptionId,
        revision: await digestCanonical({ description }),
        kind: "page_description" as const,
        byte_length: encoder.encode(description).length,
        readable: true,
        body: description,
        src: "",
      },
      ...records,
    ];
    const revision = await digestCanonical({
      epoch,
      total: scripts.length,
      entries: entries.map(({ resource_id, revision }) => ({
        resource_id,
        revision,
      })),
    });
    const inventory: PageResourceInventory = {
      document_epoch: epoch,
      revision,
      items: entries.map(({ body: _body, src: _src, ...metadata }) => metadata),
      total_count: scripts.length + 1,
      truncated: scripts.length > 256,
    };
    return { inventory, entries };
  };
  return {
    async handle(message: Record<string, unknown>): Promise<unknown> {
      if (message.document_epoch !== epoch) return { status: "STALE" };
      const before = await collect();
      if (message.kind === "CONTENT_PAGE_RESOURCES") return before.inventory;
      if (
        message.kind !== "CONTENT_PAGE_RESOURCE_READ" ||
        message.inventory_revision !== before.inventory.revision
      )
        return { status: "STALE" };
      const entry = before.entries.find(
        (item) => item.resource_id === message.resource_id,
      );
      if (!entry) return { status: "NOT_FOUND" };
      if (!entry.readable) return { status: "UNSUPPORTED" };
      if (entry.kind !== "page_description" && message.source_consent !== true)
        return { status: "CONSENT_REQUIRED" };
      let body = entry.body;
      if (entry.src) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10_000);
        try {
          const response = await fetch(entry.src, {
            credentials: "omit",
            redirect: "error",
            cache: "no-store",
            signal: controller.signal,
          });
          if (!response.ok || !response.body) return { status: "FAILED" };
          const reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let size = 0;
          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > 1024 * 1024) {
              await reader.cancel();
              return { status: "UNSUPPORTED" };
            }
            chunks.push(chunk.value);
          }
          const bytes = new Uint8Array(size);
          let offset = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.length;
          }
          body = new TextDecoder().decode(bytes);
        } catch {
          return { status: "FAILED" };
        } finally {
          clearTimeout(timer);
        }
      }
      if ((await collect()).inventory.revision !== before.inventory.revision)
        return { status: "STALE" };
      return {
        status: "AVAILABLE",
        document_epoch: epoch,
        inventory_revision: before.inventory.revision,
        resource_id: entry.resource_id,
        revision: await digestCanonical({ body }),
        body,
      };
    },
  };
};
