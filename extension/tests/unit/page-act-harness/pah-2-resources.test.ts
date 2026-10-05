import { describe, expect, it } from "vitest";
import {
  buildResourceInventory,
  containsCredentialLike,
} from "../../../src/page-act-harness/resource-inventory.js";
import {
  readResourceChunk,
  searchAllowedSources,
} from "../../../src/page-act-harness/resource-reader.js";

// PAH-2 contract/unit scope: inventory pagination, consent-gated chunk
// reads, masking, and stale handling. Live fetch/host policy integration
// is verified in Chrome, not here (§12).
const meta = () => [
  {
    resource_id: "section-abcdefghijklm",
    kind: "page_description" as const,
    byte_length: 120,
    revision: "rev-aaaaaaaaaaaaaaa1",
    consent: "GRANTED" as const,
    readable: true,
  },
  {
    resource_id: "script-inline-aaaaaaa1",
    kind: "inline_script" as const,
    byte_length: 5000,
    revision: "rev-bbbbbbbbbbbbbbb1",
    consent: "REQUIRED" as const,
    readable: true,
  },
  {
    resource_id: "script-ext-aaaaaaaaaa1",
    kind: "external_script" as const,
    origin: "https://cdn.other.test",
    byte_length: 90000,
    revision: "rev-ccccccccccccccc1",
    consent: "GRANTED" as const,
    readable: true,
  },
];

describe("PAH-2 resource inventory and partial reads", () => {
  it("pages_a_large_inventory_without_claiming_full_review", () => {
    const big = Array.from({ length: 25 }, (_, i) => ({
      resource_id: `resource-${String(i).padStart(4, "0")}aaaaaaaa`,
      kind: "page_description" as const,
      byte_length: 10,
      revision: "rev-aaaaaaaaaaaaaaa1",
      consent: "GRANTED" as const,
      readable: true,
    }));
    const first = buildResourceInventory(big, { page_size: 20 });
    expect(first.items.length).toBe(20);
    expect(first.next_cursor).toBe("20");
    const second = buildResourceInventory(big, { cursor: "20", page_size: 20 });
    expect(second.items.length).toBe(5);
    expect(second.next_cursor).toBeNull();
  });

  it("denies_external_scripts_fail_closed_without_a_page_origin", () => {
    const page = buildResourceInventory(meta());
    expect(page.items[2]?.state).toBe("DENIED");
    const same = buildResourceInventory(
      [
        {
          resource_id: "script-ext-aaaaaaaaaa1",
          kind: "external_script" as const,
          origin: "https://app.test/lib.js",
          byte_length: 10,
          revision: "rev-ccccccccccccccc1",
          consent: "GRANTED" as const,
          readable: true,
        },
      ],
      { page_origin: "https://app.test/page" },
    );
    expect(same.items[0]?.state).toBe("AVAILABLE");
  });

  it("rejects_invalid_cursors_and_page_sizes", () => {
    expect(() => buildResourceInventory(meta(), { cursor: "20abc" })).toThrow(
      "INVALID_CURSOR",
    );
    expect(() => buildResourceInventory(meta(), { cursor: "999" })).toThrow(
      "INVALID_CURSOR",
    );
    expect(() => buildResourceInventory(meta(), { page_size: 0 })).toThrow(
      "INVALID_PAGE_SIZE",
    );
  });

  it("rejects_invalid_ranges_and_never_returns_empty_success", () => {
    const store = {
      resource_id: "section-abcdefghijklm",
      revision: "rev-aaaaaaaaaaaaaaa1",
      kind: "page_description",
      body: "hello",
      consent: "GRANTED" as const,
      readable: true,
    };
    const input = {
      evidence_id: "ev-read-abcdefghijklmnop",
      request_revision: 1,
      binding_revision: "epoch-abcdefghijklmnop",
      resource_id: "section-abcdefghijklm",
      max_bytes: 100,
      current_revision: "rev-aaaaaaaaaaaaaaa1",
    };
    expect(() => readResourceChunk(store, { ...input, offset: -1 })).toThrow(
      "INVALID_OFFSET",
    );
    expect(() =>
      readResourceChunk(store, { ...input, offset: 0, max_bytes: 0 }),
    ).toThrow("INVALID_MAX_BYTES");
    const beyond = readResourceChunk(store, { ...input, offset: 99 });
    expect(beyond.status).toBe("FAILED");
    expect(beyond.coverage.complete).toBe(false);
    const mismatch = readResourceChunk(store, {
      ...input,
      offset: 0,
      resource_id: "other-abcdefghijklmnopq",
    });
    expect(mismatch.status).toBe("NOT_FOUND");
  });

  it("withholds_body_on_consent_required_and_reports_denial_as_failure", () => {
    const denied = readResourceChunk(
      {
        resource_id: "script-inline-aaaaaaa1",
        revision: "rev-bbbbbbbbbbbbbbb1",
        kind: "inline_script",
        body: "secret",
        consent: "DENIED",
        readable: true,
      },
      {
        evidence_id: "ev-read-abcdefghijklmnop",
        request_revision: 1,
        binding_revision: "epoch-abcdefghijklmnop",
        resource_id: "script-inline-aaaaaaa1",
        offset: 0,
        max_bytes: 100,
        current_revision: "rev-bbbbbbbbbbbbbbb1",
      },
    );
    expect(denied.status).toBe("DENIED");
    expect(denied.content).toBeUndefined();
    const gated = readResourceChunk(
      {
        resource_id: "script-inline-aaaaaaa1",
        revision: "rev-bbbbbbbbbbbbbbb1",
        kind: "inline_script",
        body: "secret",
        consent: "REQUIRED",
        readable: true,
      },
      {
        evidence_id: "ev-read-abcdefghijklmnop",
        request_revision: 1,
        binding_revision: "epoch-abcdefghijklmnop",
        resource_id: "script-inline-aaaaaaa1",
        offset: 0,
        max_bytes: 100,
        current_revision: "rev-bbbbbbbbbbbbbbb1",
      },
    );
    expect(gated.status).toBe("CONSENT_REQUIRED");
    expect(gated.content).toBeUndefined();
  });

  it("masks_a_keyword_split_by_a_chunk_boundary_on_both_sides", () => {
    const body = `${"A".repeat(190)}\napi_key=topsecretvalue12345\n${"B".repeat(190)}`;
    const storeBase = {
      resource_id: "script-inline-aaaaaaa1",
      revision: "rev-bbbbbbbbbbbbbbb1",
      kind: "inline_script",
      body,
      consent: "GRANTED" as const,
      readable: true,
    };
    const inputBase = {
      evidence_id: "ev-read-abcdefghijklmnop",
      request_revision: 1,
      binding_revision: "epoch-abcdefghijklmnop",
      resource_id: "script-inline-aaaaaaa1",
      current_revision: "rev-bbbbbbbbbbbbbbb1",
    };
    const first = readResourceChunk(storeBase, {
      ...inputBase,
      offset: 0,
      max_bytes: 200,
    });
    const firstText = JSON.stringify(first.content);
    expect(firstText).not.toContain("api_key");
    expect(firstText).not.toContain("topsecretvalue");
    expect(firstText).toContain("[REDACTED:credential-like]");
    const cursor = Number(first.continuation?.cursor.split(":")[1] ?? 200);
    const second = readResourceChunk(storeBase, {
      ...inputBase,
      offset: cursor,
      max_bytes: 2000,
    });
    expect(JSON.stringify(second.content)).not.toContain("topsecretvalue");
    expect(second.masking.redacted_count).toBeGreaterThan(0);
  });

  it("redacts_a_value_stranded_on_the_line_after_its_keyword", () => {
    const body =
      "config = load()\napi_key\nsuper-secret-value-abcdef123456789\nstatus = ok";
    const read = readResourceChunk(
      {
        resource_id: "script-inline-aaaaaaa1",
        revision: "rev-bbbbbbbbbbbbbbb1",
        kind: "inline_script",
        body,
        consent: "GRANTED",
        readable: true,
      },
      {
        evidence_id: "ev-read-abcdefghijklmnop",
        request_revision: 1,
        binding_revision: "epoch-abcdefghijklmnop",
        resource_id: "script-inline-aaaaaaa1",
        offset: "config = load()\napi_key\n".length,
        max_bytes: 200,
        current_revision: "rev-bbbbbbbbbbbbbbb1",
      },
    );
    expect(JSON.stringify(read.content)).not.toContain("super-secret-value");
  });

  it("masks_search_excerpts_using_full_line_context", () => {
    const { hits } = searchAllowedSources(
      [
        {
          resource_id: "script-inline-aaaaaaa1",
          revision: "rev-bbbbbbbbbbbbbbb1",
          kind: "inline_script",
          body: 'function connect() {\n  const api_key = "sk-live-abcdef123456";\n  return open(query);\n}',
          consent: "GRANTED",
          readable: true,
        },
      ],
      "open(query)",
    );
    expect(hits.length).toBe(1);
    expect(hits[0]?.excerpt).not.toContain("sk-live-abcdef123456");
    expect(hits[0]?.excerpt.length ?? 0).toBeLessThanOrEqual(200);
  });

  it("reads_chunks_with_continuation_and_masks_credential_like_lines", () => {
    expect(containsCredentialLike("api_key=123")).toBe(true);
    const body = `${"a".repeat(250)}\napi_key=should-redact\n${"b".repeat(250)}`;
    const first = readResourceChunk(
      {
        resource_id: "section-abcdefghijklm",
        revision: "rev-aaaaaaaaaaaaaaa1",
        kind: "page_description",
        body,
        consent: "GRANTED",
        readable: true,
      },
      {
        evidence_id: "ev-read-abcdefghijklmnop",
        request_revision: 1,
        binding_revision: "epoch-abcdefghijklmnop",
        resource_id: "section-abcdefghijklm",
        offset: 0,
        max_bytes: 200,
        current_revision: "rev-aaaaaaaaaaaaaaa1",
      },
    );
    expect(first.status).toBe("AVAILABLE");
    expect(first.coverage.truncated).toBe(true);
    expect(first.continuation?.cursor).toContain("offset:");
    const tail = readResourceChunk(
      {
        resource_id: "section-abcdefghijklm",
        revision: "rev-aaaaaaaaaaaaaaa1",
        kind: "page_description",
        body,
        consent: "GRANTED",
        readable: true,
      },
      {
        evidence_id: "ev-read-abcdefghijklmnop",
        request_revision: 1,
        binding_revision: "epoch-abcdefghijklmnop",
        resource_id: "section-abcdefghijklm",
        offset: Number(first.continuation?.cursor.split(":")[1] ?? 200),
        max_bytes: 2000,
        current_revision: "rev-aaaaaaaaaaaaaaa1",
      },
    );
    expect(tail.coverage.truncated).toBe(false);
    expect(JSON.stringify(tail.content)).not.toContain("should-redact");
    expect(tail.masking.redacted_count).toBeGreaterThan(0);
  });

  it("returns_stale_on_source_change_and_marks_unsupported_channels", () => {
    const stale = readResourceChunk(
      {
        resource_id: "section-abcdefghijklm",
        revision: "rev-new-aaaaaaaaaaaaa1",
        kind: "page_description",
        body: "new",
        consent: "GRANTED",
        readable: true,
      },
      {
        evidence_id: "ev-read-abcdefghijklmnop",
        request_revision: 1,
        binding_revision: "epoch-abcdefghijklmnop",
        resource_id: "section-abcdefghijklm",
        offset: 0,
        max_bytes: 100,
        current_revision: "rev-aaaaaaaaaaaaaaa1",
      },
    );
    expect(stale.status).toBe("STALE");
    expect(stale.resource_revision).toBe("rev-new-aaaaaaaaaaaaa1");
    expect(stale.continuation?.reason).toBe("RE_DISCOVER");
    expect(stale.coverage.complete).toBe(false);
    const unsupported = readResourceChunk(
      {
        resource_id: "section-abcdefghijklm",
        revision: "rev-aaaaaaaaaaaaaaa1",
        kind: "external_script",
        body: "x",
        consent: "GRANTED",
        readable: false,
      },
      {
        evidence_id: "ev-read-abcdefghijklmnop",
        request_revision: 1,
        binding_revision: "epoch-abcdefghijklmnop",
        resource_id: "section-abcdefghijklm",
        offset: 0,
        max_bytes: 100,
        current_revision: "rev-aaaaaaaaaaaaaaa1",
      },
    );
    expect(unsupported.status).toBe("UNSUPPORTED");
  });

  it("searches_only_allowed_sources_and_reports_gated_skips", () => {
    const { hits, complete, skipped_count } = searchAllowedSources(
      [
        {
          resource_id: "section-abcdefghijklm",
          revision: "rev-aaaaaaaaaaaaaaa1",
          kind: "page_description",
          body: "addEventListener handler here",
          consent: "GRANTED",
          readable: true,
        },
        {
          resource_id: "script-inline-aaaaaaa1",
          revision: "rev-bbbbbbbbbbbbbbb1",
          kind: "inline_script",
          body: "addEventListener hidden",
          consent: "REQUIRED",
          readable: true,
        },
      ],
      "addEventListener",
    );
    expect(hits.length).toBe(1);
    expect(hits[0]?.resource_id).toBe("section-abcdefghijklm");
    // Gated sources are skipped, so the hit list is never a full review.
    expect(skipped_count).toBe(1);
    expect(complete).toBe(false);
    expect(hits[0]?.excerpt.length ?? 0).toBeLessThanOrEqual(200);
  });

  it("redacts_percent_encoded_credential_keys_in_chunks_and_search", () => {
    // Synthetic value carries no credential keyword by itself; only the
    // decoded key (`%74oken` -> `token`) marks the line sensitive.
    const marker = "Qs7K9m2Zx4Pv8Lw0Nq5Rt6Y";
    const body = [
      "const endpoint = 'https://app.test/cb';",
      `fetch(endpoint + '?%74oken=${marker}');`,
      "// 100%25 off today",
    ].join("\n");
    const storeBase = {
      resource_id: "script-inline-aaaaaaa1",
      revision: "rev-bbbbbbbbbbbbbbb1",
      kind: "inline_script",
      body,
      consent: "GRANTED" as const,
      readable: true,
    };
    const inputBase = {
      evidence_id: "ev-read-abcdefghijklmnop",
      request_revision: 1,
      binding_revision: "epoch-abcdefghijklmnop",
      resource_id: "script-inline-aaaaaaa1",
      current_revision: "rev-bbbbbbbbbbbbbbb1",
    };
    const read = readResourceChunk(storeBase, {
      ...inputBase,
      offset: 0,
      max_bytes: 2000,
    });
    const text = JSON.stringify(read.content);
    expect(text).not.toContain(marker);
    expect(text).toContain("[REDACTED:credential-like]");
    expect(text).toContain("// 100%25 off today");
    expect(read.masking.redacted_count).toBeGreaterThan(0);
    expect(read.masking.categories).toEqual(["credential-like"]);

    // A value stranded on the line after an ENCODED key is shielded too.
    const stranded = readResourceChunk(
      { ...storeBase, body: `?%74oken\n${marker}\n// done` },
      { ...inputBase, offset: 0, max_bytes: 2000 },
    );
    expect(JSON.stringify(stranded.content)).not.toContain(marker);

    const { hits } = searchAllowedSources(
      [
        {
          resource_id: "script-inline-aaaaaaa1",
          revision: "rev-bbbbbbbbbbbbbbb1",
          kind: "inline_script",
          body,
          consent: "GRANTED",
          readable: true,
        },
      ],
      "fetch(endpoint",
    );
    expect(hits.length).toBe(1);
    expect(hits[0]?.excerpt ?? "").not.toContain(marker);
  });

  it("redacts_undecodable_percent_sequences_explicitly", () => {
    const read = readResourceChunk(
      {
        resource_id: "script-inline-aaaaaaa1",
        revision: "rev-bbbbbbbbbbbbbbb1",
        kind: "inline_script",
        body: "const q = '%E0%A4%A=1';",
        consent: "GRANTED",
        readable: true,
      },
      {
        evidence_id: "ev-read-abcdefghijklmnop",
        request_revision: 1,
        binding_revision: "epoch-abcdefghijklmnop",
        resource_id: "script-inline-aaaaaaa1",
        offset: 0,
        max_bytes: 200,
        current_revision: "rev-bbbbbbbbbbbbbbb1",
      },
    );
    expect(JSON.stringify(read.content)).not.toContain("%E0%A4%A");
    expect(read.masking.redacted_count).toBeGreaterThan(0);
  });
});
