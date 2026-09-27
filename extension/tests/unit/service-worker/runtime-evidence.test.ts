import { describe, expect, it, vi } from "vitest";
import { createRuntimeEvidenceSink } from "../../../src/service-worker/runtime-evidence.js";
import type { BrowserChromeApi } from "../../../src/service-worker/browser-api.js";

const event = {
  event: "policy" as const,
  run_id: "run-1",
  origin: "https://portal.company.test",
  decision: "ALLOW" as const,
};
const chromeWith = (
  get: (key: string | null) => Promise<Record<string, unknown>>,
): BrowserChromeApi =>
  ({ storage: { managed: { get } } }) as unknown as BrowserChromeApi;
const configured = () =>
  chromeWith(async () => ({
    runtime_evidence: {
      schema_version: 1,
      endpoint: "https://audit.company.test/events",
    },
  }));

describe("runtime evidence sink", () => {
  it("posts_only_validated_metadata_without_browser_credentials", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    const sink = createRuntimeEvidenceSink(
      configured(),
      fetcher as typeof fetch,
    );
    await expect(sink.emit(event)).resolves.toBe("SENT");
    const [url, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://audit.company.test/events");
    expect(init).toMatchObject({
      method: "POST",
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
    });
    expect(JSON.parse(String(init.body))).toEqual(event);
    expect(String(init.body)).not.toContain("prompt");
  });
  it("skips_only_absent_configuration_and_fails_on_malformed_or_unreadable_configuration", async () => {
    const fetcher = vi.fn();
    await expect(
      createRuntimeEvidenceSink(
        chromeWith(async () => ({})),
        fetcher as typeof fetch,
      ).emit(event),
    ).resolves.toBe("SKIPPED");
    for (const get of [
      async () => ({ runtime_evidence: null }),
      async () => ({
        runtime_evidence: {
          schema_version: 1,
          endpoint: "http://audit.company.test/events",
        },
      }),
      async () => {
        throw new Error("storage failed");
      },
      async () => undefined as unknown as Record<string, unknown>,
    ]) {
      await expect(
        createRuntimeEvidenceSink(
          chromeWith(get),
          fetcher as typeof fetch,
        ).emit(event),
      ).resolves.toBe("FAILED");
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects_raw_event_data_before_network_and_never_retries_failed_delivery", async () => {
    const fetcher = vi.fn(
      async () => new Response("unavailable", { status: 503 }),
    );
    const sink = createRuntimeEvidenceSink(
      configured(),
      fetcher as typeof fetch,
    );
    await expect(
      sink.emit({ ...event, prompt: "secret" } as never),
    ).resolves.toBe("FAILED");
    expect(fetcher).not.toHaveBeenCalled();
    await expect(sink.emit(event)).resolves.toBe("FAILED");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
