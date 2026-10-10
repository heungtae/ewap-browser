import { expect, it } from "vitest";
import { createActHarnessReadExecutor } from "../../../src/service-worker/act-harness-turns.js";
import { createActReadToolRegistry } from "../../../src/service-worker/act-read-tool-registry.js";
import type { BrowserTabs } from "../../../src/service-worker/browser-api.js";
const executor = (bound: boolean) =>
  createActHarnessReadExecutor({
    snapshot: {
      document_epoch: "epoch",
      frame_id: 0,
      nodes: [],
      visible_text: "Public holdout",
    },
    tabId: 1,
    runId: "run-matrix",
    assist: {
      tabs: {} as BrowserTabs,
      redactTitle: (value) => value ?? "",
      visionEnabled: () => false,
    },
    ...(bound
      ? {
          resources: {
            documentEpoch: "epoch",
            requestRevision: 1,
            current: () => true,
            consent: async () => false,
          },
          workflows: {
            load: async () => [],
            current: () => true,
            requestRevision: 1,
          },
        }
      : {}),
  });
it("exports actual bound executors and keeps unavailable capabilities out of offered schemas", async () => {
  for (const bound of [false, true]) {
    const run = executor(bound);
    expect(run.tools.map((t) => t.function.name)).toEqual(
      run.inventory.filter((t) => t.supported).map((t) => t.name),
    );
    expect(JSON.stringify(run.inventory)).not.toContain('"execute"');
    expect(run.inventory.find((t) => t.name === "screenshot")?.supported).toBe(
      false,
    );
    expect(
      run.inventory.find((t) => t.name === "describe_component")?.supported,
    ).toBe(bound);
    expect(
      run.inventory.find((t) => t.name === "read_workflow_resource")?.supported,
    ).toBe(bound);
    expect(
      await run({ name: "read_semantic_projection", args: "{}" }),
    ).toMatchObject({ visible_text: "Public holdout" });
    expect(await run({ name: "screenshot", args: "{}" })).toMatchObject({
      status: "UNSUPPORTED",
      code: "EXECUTOR_UNAVAILABLE",
    });
  }
});
it("declares conditional consent and proves actual empty workflow list result through executor", async () => {
  const run = executor(true);
  expect(
    run.inventory.find((t) => t.name === "read_component_data")?.consent,
  ).toBe("channel-dependent");
  expect(
    run.inventory.find((t) => t.name === "read_page_resource")?.consent,
  ).toBe("source-disclosure");
  expect(run.inventory.find((t) => t.name === "zoom")?.consent).toBe(
    "vision-disclosure",
  );
  expect(
    await run({ name: "list_workflow_resources", args: "{}" }),
  ).toMatchObject({ status: "AVAILABLE", resources: [] });
});

it("rejects duplicate registrations and non-contract executor results", async () => {
  const registration = {
    schema: {
      type: "function" as const,
      function: { name: "read_test", description: "Read test", parameters: {} },
    },
    version: 1 as const,
    resultSchema: { properties: { status: { enum: ["AVAILABLE"] } } },
    mode: "act" as const,
    phase: "read" as const,
    consent: "none" as const,
    binding: "request-document" as const,
    budget: "read" as const,
  };
  expect(() => createActReadToolRegistry([registration, registration])).toThrow(
    "DUPLICATE_TOOL_REGISTRATION",
  );
  for (const result of [[], { status: "COMPLETED" }, { count: 1 }]) {
    const registry = createActReadToolRegistry([
      { ...registration, execute: async () => result },
    ]);
    expect(await registry.execute({ name: "read_test", args: "{}" })).toEqual({
      status: "FAILED",
      code: "INVALID_TOOL_RESULT",
    });
  }
});
