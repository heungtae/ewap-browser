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
