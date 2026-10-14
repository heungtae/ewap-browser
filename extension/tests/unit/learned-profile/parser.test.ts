import { describe, it, expect } from "vitest";
import {
  parsePageCommand,
  validateInvocation,
} from "../../../src/learned-profile/command-parser.js";
import { setup, receipt, match } from "./helpers.js";
async function learned() {
  const { store } = setup();
  await store.commit(await receipt(store));
  return { command: (await store.lookup(match))!.profile!.commands[0]! };
}
describe("restricted command syntax", () => {
  it.each([
    "page p help | cat",
    "page p help; echo x",
    "page p help $(x)",
    "page p help\npage p help",
    "page p help --unknown",
    "page p help --dry-run --dry-run",
    'page p help --query "unclosed',
  ])("rejects unsafe syntax: %s", async (line) => {
    const { command } = await learned();
    expect(() =>
      parsePageCommand(line, [{ ...command, namespace: "p" }]),
    ).toThrow();
  });
  it("treats quoted Unicode and shell-like text as literal input", async () => {
    const { command } = await learned();
    const c = {
      ...command,
      namespace: "p",
      name: "search" as const,
      inputs: [
        {
          name: "query" as const,
          type: "string" as const,
          required: true as const,
        },
      ],
    };
    expect(
      parsePageCommand('page p search --query "한글 $() ; |"', [c]),
    ).toEqual(validateInvocation(c, { query: "한글 $() ; |" }));
    expect(() =>
      validateInvocation(c, { query: "x", javascript: "alert(1)" }),
    ).toThrow();
  });
});
