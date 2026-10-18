export const assertReleaseDiagnostics = (info, version) => {
  if (
    info?.schema_version !== 1 ||
    info.extension_version !== version ||
    info.diagnostics_mode !== "release" ||
    info.diagnostics_masked !== true
  )
    throw new Error(
      "Release packaging requires masked diagnostics; run pnpm build:release",
    );
};
