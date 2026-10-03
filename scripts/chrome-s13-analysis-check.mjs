import { createS13AnalysisHarness } from "./chrome-s13-analysis-harness.mjs";
import { checkS13Api } from "./chrome-s13-api-check.mjs";
import {
  checkS13Lifecycle,
  checkS13Restart,
} from "./chrome-s13-lifecycle-check.mjs";
import { checkS13Coverage } from "./chrome-s13-coverage-check.mjs";

/** Real production extension and Side Panel with a controlled HTTPS provider. */
export const checkS13Analysis = async (options) => {
  const harness = await createS13AnalysisHarness(options);
  await checkS13Api(harness);
  await checkS13Lifecycle(harness);
  await checkS13Coverage(harness);
  await checkS13Restart(harness);
};
