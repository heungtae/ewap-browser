export type StudioDependency = {
  id: string;
  profile_id: string;
  fingerprint: string;
  workflow_ids: string[];
};
export type SemanticChange = {
  profile_id: string;
  before_fingerprint: string;
  after_fingerprint: string;
};

const ids = (value: readonly string[]): string[] => [...new Set(value)].sort();

export const impactedRegressionIds = (
  dependencies: readonly StudioDependency[],
  changes: readonly SemanticChange[],
): string[] => {
  const changed = new Map(
    changes.map((change) => [change.profile_id, change.after_fingerprint]),
  );
  return ids(
    dependencies.flatMap((dependency) => {
      const fingerprint = changed.get(dependency.profile_id);
      return fingerprint && fingerprint !== dependency.fingerprint
        ? dependency.workflow_ids
        : [];
    }),
  );
};
