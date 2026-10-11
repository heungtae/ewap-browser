import type { BrowserSender } from "./browser-api.js";
import type { SemanticSnapshot } from "../contracts/types.js";
import type { WorkflowDeclaration } from "../contracts/workflow.js";
import type { WorkflowCandidate } from "../contracts/workflow-catalog.js";
export type Respond = (response: unknown) => void;
export type Selection = {
  id: string;
  tabId: number;
  origin: string;
  documentEpoch: string;
};
type Active = {
  tabId: number;
  origin: string;
  path: string;
  snapshot: SemanticSnapshot;
};
type Candidate = {
  candidate: WorkflowCandidate;
  declaration: WorkflowDeclaration;
};
type Preview =
  | {
      scripts: unknown[];
      script_count: number;
      origins: string[];
      inline_chars: number;
    }
  | { [key: string]: unknown };
export type Dependencies = {
  isPanelSender(sender: BrowserSender): boolean;
  selection(id: string): Selection | undefined;
  preview(tabId: number, documentEpoch: string): Promise<Preview>;
  active(): Promise<Active>;
  source(selection: Selection): Promise<string>;
  chat(request: {
    messages: { role: "system" | "user"; content: string }[];
  }): Promise<{ tool_calls: unknown[]; content?: string }>;
  parse(content: string): WorkflowDeclaration;
  targetsMatch(
    snapshot: SemanticSnapshot,
    declaration: WorkflowDeclaration,
  ): boolean;
  candidate(declaration: WorkflowDeclaration, active: Active): Candidate;
  save(selection: Selection, candidate: Candidate): Promise<void>;
  systemPrompt: string;
  safeFailure(code: string): unknown;
};
