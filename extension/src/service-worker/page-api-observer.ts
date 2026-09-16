import type { SemanticSnapshot } from "../contracts/semantic-types.js";
import type { PageApiIntent } from "../contracts/page-api-types.js";

type Completion = { control_name: string; option_name: string };

/**
 * Reads the isolated semantic projection after MAIN returns.  It deliberately
 * ignores the page function's return value.
 */
export const createPageApiObserver =
  (read: (tabId: number, remainingMs: number) => Promise<SemanticSnapshot>) =>
  async (
    intent: PageApiIntent,
    optionName: string,
    completion: Completion,
    remainingMs: number,
  ): Promise<"satisfied" | "pending" | "invalid"> => {
    if (remainingMs <= 0) return "invalid";
    const snapshot = await read(intent.tab_id, remainingMs);
    if (
      snapshot.document_epoch !== intent.document_epoch ||
      snapshot.frame_id !== 0
    )
      return "invalid";
    const controls = snapshot.nodes.filter(
      (node) =>
        (node.role === "combobox" || node.role === "listbox") &&
        node.name === completion.control_name,
    );
    const options = snapshot.nodes.filter(
      (node) => node.role === "option" && node.name === optionName,
    );
    if (controls.length !== 1 || options.length !== 1) return "invalid";
    return options[0]?.state.selected === true ? "satisfied" : "pending";
  };
