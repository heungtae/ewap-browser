export const s19Cases = () => [
  ...["table", "list", "tree", "chart", "svg", "canvas", "unclassified"].map(
    (kind) => ({
      id: kind,
      kind,
      channel:
        kind === "table"
          ? "subtree"
          : kind === "list" || kind === "tree"
            ? "visible_rows"
            : "description",
    }),
  ),
  { id: "alternative", kind: "chart", channel: "alt_table" },
  { id: "alternative-missing", kind: "chart", channel: "alt_table" },
  {
    id: "tree-expand-action",
    kind: "tree",
    channel: "subtree",
    action: true,
    target: "Expand branch",
    actionCalls: 0,
    actionPrompt:
      "First submit_plan for my review. After I approve the plan, expand the Closed branch with the visible Expand branch button, then inspect its now available children using component tools.",
  },
  {
    id: "paging-action",
    kind: "table",
    channel: "subtree",
    action: true,
    target: "Next data page",
    actionCalls: 0,
    actionPrompt:
      "First submit_plan for my review. After I approve the plan, move to the next data page with the visible Next data page tab, then inspect the changed table through component tools.",
  },
  { id: "scroll", kind: "grid", channel: "bounded_scroll" },
  { id: "deny", kind: "grid", channel: "bounded_scroll" },
  { id: "stop", kind: "grid", channel: "bounded_scroll" },
  { id: "stale", kind: "grid", channel: "bounded_scroll" },
  { id: "vision", kind: "canvas", channel: "visual" },
  { id: "vision-deny", kind: "canvas", channel: "visual" },
  { id: "sensitive", kind: "table", channel: "subtree" },
  { id: "vision-sensitive", kind: "canvas", channel: "visual" },
  { id: "paging-unsupported", kind: "table", channel: "continuation" },
  { id: "tree-expansion-unsupported", kind: "tree", channel: "continuation" },
];
