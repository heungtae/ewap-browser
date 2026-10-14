export const taskKinds = [
  "help",
  "table-read",
  "search",
  "navigate",
  "form",
  "method",
] as const;
export const readKinds = [
  "read_semantic_projection",
  "read_page",
  "get_page_text",
  "find",
  "list_page_resources",
  "search_page_resources",
  "read_page_resource",
  "describe_component",
  "read_component_data",
] as const;
export type TaskKind = (typeof taskKinds)[number];
export type ReadKind = (typeof readKinds)[number];
export type LearnedTask = {
  kind: TaskKind;
  mode: "ask" | "act";
  target: "page" | "table" | "list" | "form" | "link" | "method";
  coverage: "visible" | "full";
  input: "none" | "text" | "number" | "boolean";
};
export type LearnedStep = {
  channel: "read" | "ui" | "method";
  operation:
    | ReadKind
    | "click"
    | "navigate"
    | "set-text"
    | "select"
    | "check"
    | "method-rediscovery";
  target_guard?: string;
};
export type PageMatch = {
  origin: string;
  page_key: string;
  scope: string;
  context_guard: string;
  structure_guard: string;
};
export type PageCommand = {
  command_id: string;
  revision: number;
  namespace: string;
  name: TaskKind;
  recipe_id: string;
  recipe_revision: number;
  backend: "read_recipe" | "ui_recipe" | "method_hint";
  effect: "read" | "ui_change" | "method_unknown";
  inputs: { name: "query"; type: "string"; required: true }[];
};
export type LearnedRecipe = {
  recipe_id: string;
  revision: number;
  task: LearnedTask;
  steps: LearnedStep[];
  enabled: boolean;
  auto_update: boolean;
  lifecycle: "active" | "stale" | "quarantined" | "disabled";
  successful_at: number;
  name: string;
  history: {
    revision: number;
    at: number;
    kind: "success" | "failure" | "repair";
    steps?: LearnedStep[];
  }[];
};
export type LearnedPageProfile = {
  schema_version: 1;
  profile_id: string;
  revision: number;
  management_revision: number;
  source: "local_success";
  authority: "advisory";
  page_match: PageMatch;
  name: string;
  notes: string;
  enabled: boolean;
  auto_update: boolean;
  recipes: LearnedRecipe[];
  commands: PageCommand[];
  created_at: number;
  updated_at: number;
};
export type LearnedCatalog = {
  schema_version: 1;
  catalog_revision: number;
  enabled: boolean;
  records: LearnedPageProfile[];
  receipts: string[];
};
export type LearningTicket = {
  catalog_revision: number;
  match: PageMatch;
  profile?: LearnedPageProfile;
};
export type SuccessReceipt = {
  receipt_id: string;
  ticket: LearningTicket;
  task: LearnedTask;
  steps: LearnedStep[];
  completed: true;
  required_failure: false;
  mutation_unknown: false;
  full_recipe: true;
  consumed_recipe?: string;
};
export const STORAGE_KEY = "learned_page_profiles_v1";
export const TTL = 30 * 24 * 60 * 60_000;
