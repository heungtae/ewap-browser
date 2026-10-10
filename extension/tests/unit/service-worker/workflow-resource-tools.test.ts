import { describe, expect, it } from "vitest";
import { createWorkflowResourceExecutor } from "../../../src/service-worker/workflow-resource-tools.js";
import type { CandidateDefinition } from "../../../src/service-worker/workflow-catalog-runtime.js";
import { maskTraceValue } from "../../../src/diagnostics/trace-mask.js";

export const resourceCandidate = (
  source: "recorded" | "profile" | "runtime",
  id: string,
): CandidateDefinition => ({
  candidate: {
    id,
    source,
    title: "Same workflow",
    origin: "https://example.test",
    path_prefix: "/",
    status: "verified",
    step_count: 1,
    detail: "fixture",
  },
  declaration: {
    schema_version: 1,
    id,
    title: "Same workflow",
    steps: [
      {
        id: "one",
        tool: "click_by_ref",
        target: { role: "button", name: "가😀".repeat(40) },
        branches: [
          {
            when: {
              kind: "target_state",
              target: { role: "checkbox", name: "Ready" },
              field: "checked",
              expected: source === "profile",
            },
            next: "one",
          },
        ],
      },
    ],
  },
});
type Result = {
  status: string;
  code?: string;
  resources: Array<{
    resource_id: string;
    resource_revision: string;
    source: string;
    suitability: string;
  }>;
  source_text: string;
  coverage: { complete: boolean };
  next_cursor: string | null;
  continuation?: { tool: string; arguments: Record<string, unknown> };
};
const execute = async (
  reader: ReturnType<typeof createWorkflowResourceExecutor>,
  name: string,
  args = {},
): Promise<Result> =>
  (await reader.execute({ name, args: JSON.stringify(args) })) as Result;

describe("S18 workflow originals", () => {
  it("paginates all three sources and preserves original branch differences across UTF-8 chunks", async () => {
    const candidates = [
      resourceCandidate("recorded", "saved"),
      resourceCandidate("profile", "profile"),
      resourceCandidate("runtime", "generated"),
    ];
    const reader = createWorkflowResourceExecutor({
      load: async () => candidates,
      current: () => true,
      requestRevision: 2,
    });
    const discovered: Result["resources"] = [];
    let list = await execute(reader, "list_workflow_resources", {
      page_size: 1,
    });
    for (let pageIndex = 0; pageIndex < 4; pageIndex++) {
      discovered.push(...list.resources);
      expect(list.resources[0]?.suitability).toBe("unreviewed");
      if (!list.next_cursor) break;
      list = await execute(
        reader,
        "list_workflow_resources",
        list.continuation!.arguments,
      );
    }
    expect(discovered.map((item) => item.source)).toEqual([
      "saved",
      "profile",
      "page_generated",
    ]);
    for (const [index, resource] of discovered.entries()) {
      expect(await reader.reviewReady(candidates[index]!.declaration)).toBe(
        false,
      );
      let read = await execute(reader, "read_workflow_resource", {
        resource_id: resource.resource_id,
        resource_revision: resource.resource_revision,
        max_bytes: 256,
      });
      let text = read.source_text;
      while (read.next_cursor) {
        expect(read.coverage.complete).toBe(false);
        read = await execute(
          reader,
          "read_workflow_resource",
          read.continuation!.arguments,
        );
        text += read.source_text;
      }
      expect(JSON.parse(text)).toEqual(candidates[index]!.declaration);
      expect(read.coverage.complete).toBe(true);
      expect(await reader.reviewReady(candidates[index]!.declaration)).toBe(
        true,
      );
      expect(
        await reader.reviewReady(
          candidates[index]!.declaration,
          "other-candidate",
        ),
      ).toBe(false);
    }
  });
  it("rejects source changes, cancellation, unknown resource IDs and mixed cursors", async () => {
    const items = [
      resourceCandidate("recorded", "saved"),
      resourceCandidate("runtime", "generated"),
    ];
    const controller = new AbortController();
    const reader = createWorkflowResourceExecutor({
      load: async () => items,
      current: () => true,
      signal: controller.signal,
      requestRevision: 1,
    });
    expect(
      (
        await execute(reader, "list_workflow_resources", {
          constructor: "not-a-parameter",
        })
      ).code,
    ).toBe("INVALID_ARGUMENT");
    const page = await execute(reader, "list_workflow_resources", {
      page_size: 1,
    });
    expect(
      (
        await execute(reader, "list_workflow_resources", {
          cursor: page.next_cursor,
          source: "profile",
        })
      ).code,
    ).toBe("INVALID_CURSOR");
    expect(
      (
        await execute(reader, "read_workflow_resource", {
          resource_id: "foreign",
          resource_revision: "foreign",
        })
      ).status,
    ).toBe("NOT_FOUND");
    const first = page.resources[0]!;
    expect(
      (
        await execute(reader, "read_workflow_resource", {
          resource_id: first.resource_id,
          resource_revision: first.resource_revision,
          cursor: page.next_cursor,
        })
      ).code,
    ).toBe("INVALID_CURSOR");
    items[0]!.declaration.steps[0]!.branches![0]!.when = {
      kind: "last_option_equals",
      value: "changed",
    };
    expect((await execute(reader, "list_workflow_resources")).status).toBe(
      "STALE",
    );
    controller.abort();
    expect((await execute(reader, "list_workflow_resources")).status).toBe(
      "STALE",
    );
  });
  it("binds a complete read to the selected candidate and invalidates changed Profile provenance", async () => {
    const saved = resourceCandidate("recorded", "saved");
    const profile = resourceCandidate("profile", "profile");
    profile.declaration = structuredClone(saved.declaration);
    const reader = createWorkflowResourceExecutor({
      load: async () => [saved, profile],
      current: () => true,
      requestRevision: 1,
    });
    const page = await execute(reader, "list_workflow_resources");
    const resource = page.resources[0]!;
    await execute(reader, "read_workflow_resource", {
      resource_id: resource.resource_id,
      resource_revision: resource.resource_revision,
    });
    expect(await reader.reviewReady(saved.declaration, "saved")).toBe(true);
    expect(await reader.reviewReady(profile.declaration, "profile")).toBe(
      false,
    );
    profile.candidate.detail = "Verified Profile v2";
    expect((await execute(reader, "list_workflow_resources")).status).toBe(
      "STALE",
    );
  });
  it("withholds sensitive targets and never treats a redacted original as fully reviewed", async () => {
    const candidate = resourceCandidate("runtime", "masked");
    candidate.declaration.title = "password=fixture-sensitive-value";
    const reader = createWorkflowResourceExecutor({
      load: async () => [candidate],
      current: () => true,
      requestRevision: 1,
    });
    const resource = (await execute(reader, "list_workflow_resources"))
      .resources[0]!;
    const read = await execute(reader, "read_workflow_resource", {
      resource_id: resource.resource_id,
      resource_revision: resource.resource_revision,
    });
    expect(read.source_text).not.toContain("fixture-sensitive-value");
    expect(await reader.reviewReady(candidate.declaration)).toBe(false);
    expect(JSON.stringify(maskTraceValue(read).data)).not.toContain(
      "fixture-sensitive-value",
    );
    candidate.declaration.steps[0]!.target = {
      role: "textbox",
      name: "Password",
    };
    const blocked = createWorkflowResourceExecutor({
      load: async () => [candidate],
      current: () => true,
      requestRevision: 1,
    });
    const hidden = (await execute(blocked, "list_workflow_resources"))
      .resources[0]!;
    expect(
      (
        await execute(blocked, "read_workflow_resource", {
          resource_id: hidden.resource_id,
          resource_revision: hidden.resource_revision,
        })
      ).status,
    ).toBe("UNSUPPORTED");
  });
});
