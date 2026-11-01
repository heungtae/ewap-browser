export function commandAvailable(
  kind: string,
  capabilities: ReadonlySet<string>,
) {
  if (kind.startsWith("settings.")) return capabilities.has("settings");
  if (!kind.startsWith("migration.")) return true;
  const capability =
    kind === "migration.status"
      ? "migration.status"
      : kind === "migration.resume.snapshot"
        ? "migration.resumeSnapshot"
        : kind.startsWith("migration.resume.")
          ? "migration.resume"
          : kind.startsWith("migration.checkpoints.")
            ? "migration.checkpoints"
            : kind.startsWith("migration.consensus.")
              ? "migration.consensus"
              : kind.startsWith("migration.settings.")
                ? "migration.settings"
                : "migration.policy";
  return capabilities.has(capability);
}
