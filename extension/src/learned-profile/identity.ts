import type { ActivePage } from "../service-worker/page-context-runtime.js";
import type { PageMatch } from "./types.js";
export type LocalStorage = {
  get(key: string): Promise<Record<string, unknown>>;
  set(value: Record<string, unknown>): Promise<void>;
  setAccessLevel?(value: { accessLevel: "TRUSTED_CONTEXTS" }): Promise<void>;
};
const KEY = "learned_page_profile_identity_key_v1";
export function createLearnedIdentity(storage: LocalStorage) {
  let pending: Promise<CryptoKey> | undefined;
  const key = () =>
    (pending ??= (async () => {
      await storage.setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" });
      const saved = (await storage.get(KEY))[KEY];
      let bytes: Uint8Array;
      if (typeof saved === "string" && /^[a-f0-9]{64}$/.test(saved))
        bytes = Uint8Array.from(saved.match(/../g)!, (s) => parseInt(s, 16));
      else {
        bytes = crypto.getRandomValues(new Uint8Array(32));
        await storage.set({
          [KEY]: Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
            "",
          ),
        });
      }
      return crypto.subtle.importKey(
        "raw",
        bytes,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
    })());
  const hash = async (value: string) =>
    Array.from(
      new Uint8Array(
        await crypto.subtle.sign(
          "HMAC",
          await key(),
          new TextEncoder().encode(value),
        ),
      ),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
  return {
    hash,
    async match(active: ActivePage): Promise<PageMatch | undefined> {
      if (
        !active.url ||
        active.snapshot.truncated ||
        (active.snapshot.node_count !== undefined &&
          active.snapshot.node_count !== active.snapshot.nodes.length)
      )
        return undefined;
      const url = new URL(active.url);
      if (url.origin !== active.origin) return undefined;
      // Exact-page reuse includes all currently observable context; no hidden account data is read.
      // Changes to page text cause a conservative miss, including account/tenant changes.
      const context = await hash(
        JSON.stringify({
          text: active.snapshot.visible_text,
          names: active.snapshot.nodes.map((n) => [n.role, n.name, n.visible]),
        }),
      );
      const structure = await hash(
        JSON.stringify(
          active.snapshot.nodes.map((n) => [
            n.role,
            n.supported_actions,
            n.visible,
            n.enabled,
          ]),
        ),
      );
      return {
        origin: url.origin,
        page_key: await hash(url.href),
        scope: active.snapshot.scope ?? "all_dom",
        context_guard: context,
        structure_guard: structure,
      };
    },
  };
}
