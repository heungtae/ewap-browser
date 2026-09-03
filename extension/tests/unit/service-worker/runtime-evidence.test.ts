import { describe, expect, it } from "vitest";
import { createRuntimeEvidenceSink } from "../../../src/service-worker/runtime-evidence.js";

describe("runtime evidence sink", () =>
  it("given_managed_https_sink_when_emitting_then_posts_redacted_event", async () => {
    let body = "";
    const sink = createRuntimeEvidenceSink(
      {
        storage: {
          managed: {
            get: async () => ({
              runtime_evidence: {
                schema_version: 1,
                endpoint: "https://audit.company.test/events",
              },
            }),
          },
        },
      } as never,
      async (_url, init) => {
        body = String(init?.body);
        return new Response("", { status: 204 });
      },
    );
    await sink.emit({ event: "policy", origin: "https://portal.company.test" });
    expect(body).toContain("portal.company.test");
    expect(body).not.toContain("prompt");
  }));
