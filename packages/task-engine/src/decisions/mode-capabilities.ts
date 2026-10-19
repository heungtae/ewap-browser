import { type Candidate } from "./schema.js";
const readTools = new Set([
  "web.discover",
  "web.search_codebase",
  "web.inspect",
  "web.get_capabilities",
  "web.scroll",
  "web.wait_for",
  "web.extract",
  "web.query",
  "web.get_chart_data",
  "web.get_table_data",
  "web.get_observed_api",
  "analysis.run",
  "task.verify",
  "task.request_approval",
  "task.complete",
]);
/** Candidate annotations cannot turn fill/click/navigation into an Ask capability. */
export const isReadStep = (step: Candidate["steps"][number]): boolean =>
  step.effect === "read" && readTools.has(step.tool);
