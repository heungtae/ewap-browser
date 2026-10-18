import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { runInNewContext } from "node:vm";
import { assertReleaseDiagnostics } from "./diagnostics-release-policy.mjs";

for (const mode of [undefined, "release", "development"]) {
  const result = buildSync({
    stdin: {
      resolveDir: process.cwd(),
      contents: `
        import { maskTraceValue } from "./extension/src/diagnostics/trace-mask.ts";
        import { diagnosticsPrivacy } from "./extension/src/diagnostics/privacy-mode.ts";
        export const privacy = diagnosticsPrivacy();
        export const logged = maskTraceValue({
          target_name: "DEVELOPMENT_TARGET_LABEL",
          prompt: "DEVELOPMENT_REQUEST_BODY",
          api_key: "DEVELOPMENT_API_CREDENTIAL",
          headers: { Authorization: "Bearer DEVELOPMENT_AUTH_HEADER" },
          arguments: { checked: true }
        });`,
    },
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
    ...(mode
      ? { define: { __CONTEXTPILOT_DIAGNOSTICS_MODE__: JSON.stringify(mode) } }
      : {}),
  });
  const sandbox = { module: { exports: {} } };
  // A compiled release ignores a conflicting runtime/global value.
  if (mode) sandbox.__CONTEXTPILOT_DIAGNOSTICS_MODE__ = "development";
  runInNewContext(result.outputFiles[0].text, sandbox);
  const { privacy, logged } = sandbox.module.exports;
  const raw = mode === "development";
  assert.equal(privacy.diagnostics_masked, !raw);
  assert.equal(privacy.diagnostics_mode, raw ? "development" : "release");
  assert.equal(logged.masking.masked, !raw);
  const serialized = JSON.stringify(logged);
  for (const marker of [
    "DEVELOPMENT_TARGET_LABEL",
    "DEVELOPMENT_REQUEST_BODY",
    "DEVELOPMENT_API_CREDENTIAL",
    "DEVELOPMENT_AUTH_HEADER",
  ])
    assert.equal(serialized.includes(marker), raw);
}

const masked = {
  schema_version: 1,
  extension_version: "1.2.3",
  diagnostics_mode: "release",
  diagnostics_masked: true,
};
assertReleaseDiagnostics(masked, "1.2.3");
for (const info of [
  undefined,
  { ...masked, diagnostics_mode: "development" },
  { ...masked, diagnostics_masked: false },
  { ...masked, extension_version: "1.2.2" },
])
  assert.throws(
    () => assertReleaseDiagnostics(info, "1.2.3"),
    /masked diagnostics/,
  );
console.log("Diagnostic build modes and release packaging policy passed.");
