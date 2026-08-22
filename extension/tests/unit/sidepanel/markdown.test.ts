import { describe, expect, it } from "vitest";
import { parseMarkdown } from "../../../src/sidepanel/markdown.js";

describe("sidepanel markdown", () => {
  it("given_company_summary_when_parsing_then_keeps_headings_bold_text_and_lists", () => {
    expect(
      parseMarkdown(
        "## 생산 역량\n\n- **월간 생산량:** 35만 장\n- **생산 캠퍼스:** 3곳",
      ),
    ).toEqual([
      {
        type: "heading",
        level: 2,
        content: [{ type: "text", text: "생산 역량" }],
      },
      {
        type: "list",
        items: [
          [
            { type: "strong", text: "월간 생산량:" },
            { type: "text", text: " 35만 장" },
          ],
          [
            { type: "strong", text: "생산 캠퍼스:" },
            { type: "text", text: " 3곳" },
          ],
        ],
      },
    ]);
  });

  it("given_html_like_text_when_parsing_then_keeps_it_as_text", () => {
    expect(parseMarkdown("<img src=x onerror=alert(1)>")).toEqual([
      {
        type: "paragraph",
        lines: [[{ type: "text", text: "<img src=x onerror=alert(1)>" }]],
      },
    ]);
  });
});
