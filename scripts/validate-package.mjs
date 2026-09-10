import { readFile } from "node:fs/promises";
const manifest = JSON.parse(
  await readFile(new URL("../extension/manifest.json", import.meta.url)),
);
const policy = JSON.parse(
  await readFile(
    new URL("../deployment/policy-development.json", import.meta.url),
  ),
);
const hostPermissions = manifest.host_permissions
  .map((entry) =>
    entry === "<all_urls>" ? entry : new URL(entry.replace("/*", "")).origin,
  )
  .sort();
const policyPermissions = [...policy.permission_origins].sort();
const expectedPermissions = [
  "activeTab",
  "debugger",
  "offscreen",
  "sidePanel",
  "storage",
  "tabs",
];
if (
  JSON.stringify([...manifest.permissions].sort()) !==
  JSON.stringify(expectedPermissions)
)
  throw new Error("manifest permission snapshot differs from bounded design");
if (manifest.permissions.includes("scripting"))
  throw new Error("manifest contains an unsupported permission");
if (
  JSON.stringify([...(manifest.optional_permissions ?? [])].sort()) !==
  JSON.stringify(["scripting"])
)
  throw new Error(
    "manifest optional permission snapshot differs from recovery design",
  );
if (manifest.permissions.includes("webNavigation"))
  throw new Error("manifest contains an unsupported permission");
if (!manifest.options_ui?.page)
  throw new Error("provider Settings page is missing");
if (manifest.storage?.managed_schema !== "managed-storage-schema.json")
  throw new Error("manifest managed storage schema is missing");
const managedSchema = JSON.parse(
  await readFile(
    new URL("../extension/managed-storage-schema.json", import.meta.url),
  ),
);
// Chrome managed storage accepts a subset of JSON Schema, not draft-07.
// In particular, additionalProperties must be a schema and is forbidden
// entirely at the root. JSON.parse alone cannot detect these load errors.
const validateManagedSchema = (schema, root = false) => {
  if (!schema || typeof schema !== "object" || Array.isArray(schema))
    throw new Error("managed storage schema must be an object");
  if (root && (schema.type !== "object" || "additionalProperties" in schema))
    throw new Error(
      "managed storage root must be object without additionalProperties",
    );
  if (!(typeof schema.$ref === "string" || typeof schema.type === "string"))
    throw new Error("managed storage schema requires a type or $ref");
  for (const child of Object.values(schema.properties ?? {}))
    validateManagedSchema(child);
  if ("additionalProperties" in schema)
    validateManagedSchema(schema.additionalProperties);
  if ("items" in schema) validateManagedSchema(schema.items);
};
validateManagedSchema(managedSchema, true);
if (JSON.stringify(hostPermissions) !== JSON.stringify(policyPermissions))
  throw new Error("manifest host_permissions and permission_origins differ");
for (const list of [
  policy.page_read_origins,
  policy.profile_resolver_origins,
  policy.llm_egress_origins,
])
  for (const origin of list)
    if (!policy.permission_origins.includes(origin))
      throw new Error(`origin outside permission boundary: ${origin}`);
console.log("package policy validation passed");
