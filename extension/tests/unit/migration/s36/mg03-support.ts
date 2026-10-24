export const savedWorkflow = {
  id: "workflow_original_001",
  title: "Original title",
  enabled: false,
  origin: "https://example.test",
  path_prefix: "/form",
  fingerprint: "old-binding",
  created_at: "2026-10-24T00:00:00Z",
  updated_at: "2026-10-24T00:00:00Z",
  declaration: {
    schema_version: 1,
    id: "workflow_original_001",
    title: "Original title",
    steps: [
      {
        id: "submit",
        tool: "click_by_ref",
        target: { role: "button", name: "Submit" },
      },
    ],
  },
};
export const savedSource = () => ({
  saved_workflows_v1: {
    schema_version: 1,
    records: [structuredClone(savedWorkflow)],
  },
});
