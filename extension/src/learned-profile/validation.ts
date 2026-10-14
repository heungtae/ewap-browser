import { validateCommands } from "./command-validation.js";
import { isPlainObject } from "../security/validation.js";
import {
  taskKinds,
  readKinds,
  type LearnedTask,
  type LearnedStep,
  type LearnedCatalog,
  type LearnedPageProfile,
} from "./types.js";
const closed = (v: Record<string, unknown>, keys: string[]) =>
  Object.keys(v).every((k) => keys.includes(k));
const member = (v: unknown, choices: readonly string[]) =>
  typeof v === "string" && choices.includes(v);
const digest = (v: unknown) =>
  typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
export function validateTask(v: unknown): LearnedTask {
  if (
    !isPlainObject(v) ||
    !closed(v, ["kind", "mode", "target", "coverage", "input"]) ||
    !member(v.kind, taskKinds) ||
    !member(v.mode, ["ask", "act"]) ||
    !member(v.target, ["page", "table", "list", "form", "link", "method"]) ||
    !member(v.coverage, ["visible", "full"]) ||
    !member(v.input, ["none", "text", "number", "boolean"])
  )
    throw new Error("INVALID_LEARNED_TASK");
  return {
    kind: v.kind,
    mode: v.mode,
    target: v.target,
    coverage: v.coverage,
    input: v.input,
  } as LearnedTask;
}
export function validateSteps(v: unknown): LearnedStep[] {
  if (!Array.isArray(v) || v.length === 0 || v.length > 12)
    throw new Error("INVALID_LEARNED_STEPS");
  for (const s of v) {
    if (
      !isPlainObject(s) ||
      !closed(s, ["channel", "operation", "target_guard"]) ||
      !member(s.channel, ["read", "ui", "method"]) ||
      (s.target_guard !== undefined && !digest(s.target_guard))
    )
      throw new Error("INVALID_LEARNED_STEP");
    if (
      !(s.channel === "read"
        ? member(s.operation, readKinds)
        : s.channel === "method"
          ? s.operation === "method-rediscovery"
          : member(s.operation, [
              "click",
              "navigate",
              "set-text",
              "select",
              "check",
            ]))
    )
      throw new Error("INVALID_LEARNED_OPERATION");
  }
  return v as LearnedStep[];
}
export function validateProfile(v: unknown): LearnedPageProfile {
  if (
    !isPlainObject(v) ||
    !closed(v, [
      "schema_version",
      "profile_id",
      "revision",
      "management_revision",
      "source",
      "authority",
      "page_match",
      "name",
      "notes",
      "enabled",
      "auto_update",
      "recipes",
      "commands",
      "created_at",
      "updated_at",
    ]) ||
    v.schema_version !== 1 ||
    v.source !== "local_success" ||
    v.authority !== "advisory" ||
    typeof v.profile_id !== "string" ||
    !/^[a-f0-9-]{36}$/.test(v.profile_id) ||
    !Number.isInteger(v.revision) ||
    !Number.isInteger(v.management_revision) ||
    typeof v.enabled !== "boolean" ||
    typeof v.auto_update !== "boolean" ||
    typeof v.name !== "string" ||
    v.name.length > 80 ||
    typeof v.notes !== "string" ||
    v.notes.length > 500 ||
    !Number.isFinite(v.created_at) ||
    !Number.isFinite(v.updated_at)
  )
    throw new Error("INVALID_LEARNED_PROFILE");
  const m = v.page_match;
  if (
    !isPlainObject(m) ||
    !closed(m, [
      "origin",
      "page_key",
      "scope",
      "context_guard",
      "structure_guard",
    ]) ||
    typeof m.origin !== "string" ||
    new URL(m.origin).origin !== m.origin ||
    !["http:", "https:"].includes(new URL(m.origin).protocol) ||
    !digest(m.page_key) ||
    !digest(m.context_guard) ||
    !digest(m.structure_guard) ||
    !member(m.scope, ["all_dom", "visible_only", "interactive"])
  )
    throw new Error("INVALID_LEARNED_MATCH");
  if (
    !Array.isArray(v.recipes) ||
    v.recipes.length > 5 ||
    !Array.isArray(v.commands) ||
    v.commands.length > 5
  )
    throw new Error("INVALID_LEARNED_RECIPES");
  for (const r of v.recipes) {
    if (
      !isPlainObject(r) ||
      !closed(r, [
        "recipe_id",
        "revision",
        "task",
        "steps",
        "enabled",
        "auto_update",
        "lifecycle",
        "successful_at",
        "name",
        "history",
      ]) ||
      typeof r.recipe_id !== "string" ||
      !/^[a-f0-9-]{36}$/.test(r.recipe_id) ||
      !Number.isInteger(r.revision) ||
      typeof r.enabled !== "boolean" ||
      typeof r.auto_update !== "boolean" ||
      typeof r.name !== "string" ||
      r.name.length > 80 ||
      !member(r.lifecycle, ["active", "stale", "quarantined", "disabled"]) ||
      !Number.isFinite(r.successful_at) ||
      !Array.isArray(r.history) ||
      r.history.length > 23
    )
      throw new Error("INVALID_LEARNED_RECIPE");
    validateTask(r.task);
    validateSteps(r.steps);
    for (const h of r.history) {
      if (
        !isPlainObject(h) ||
        !closed(h, ["revision", "at", "kind", "steps"]) ||
        !Number.isInteger(h.revision) ||
        !Number.isFinite(h.at) ||
        !member(h.kind, ["success", "failure", "repair"])
      )
        throw new Error("INVALID_LEARNED_HISTORY");
      if (h.steps !== undefined) validateSteps(h.steps);
    }
  }
  validateCommands(v.commands);
  if (new TextEncoder().encode(JSON.stringify(v)).length > 32768)
    throw new Error("PROFILE_TOO_LARGE");
  return v as LearnedPageProfile;
}
export function validateCatalog(v: unknown): LearnedCatalog {
  if (
    !isPlainObject(v) ||
    !closed(v, [
      "schema_version",
      "catalog_revision",
      "enabled",
      "records",
      "receipts",
    ]) ||
    v.schema_version !== 1 ||
    !Number.isInteger(v.catalog_revision) ||
    typeof v.enabled !== "boolean" ||
    !Array.isArray(v.records) ||
    v.records.length > 100 ||
    !Array.isArray(v.receipts) ||
    v.receipts.length > 256 ||
    !v.receipts.every((x) => typeof x === "string" && /^[a-f0-9-]{36}$/.test(x))
  )
    throw new Error("INVALID_LEARNED_CATALOG");
  for (const r of v.records) validateProfile(r);
  if (new TextEncoder().encode(JSON.stringify(v)).length > 2 * 1024 * 1024)
    throw new Error("CATALOG_TOO_LARGE");
  return v as LearnedCatalog;
}
