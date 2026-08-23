import type { CompanyTool, MutationTool } from "../contracts/types.js";
export const readTools: readonly CompanyTool[] = [
  "read_semantic_projection",
  "find_by_ref",
  "read_page_summary",
];
export const mutationTools: readonly MutationTool[] = [
  "set_text_by_ref",
  "select_option_by_ref",
  "set_checked_by_ref",
  "click_by_ref",
  "press_key_by_ref",
  "navigate",
];
export const isMutationTool = (tool: string): tool is MutationTool =>
  mutationTools.includes(tool as MutationTool);
