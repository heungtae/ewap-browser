import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const readDemo = (file: string): Promise<string> =>
  readFile(`examples/semiconductor-demo/${file}`, "utf8");

describe("semiconductor ContextPilot demo", () => {
  it("given_information_page_when_read_then_contains_grounded_fictional_company_facts", async () => {
    const page = await readDemo("index.html");
    expect(page).toContain("Asteron Semiconductor");
    expect(page).toContain("350K");
    expect(page).toContain("2nm GAA");
    expect(page).toContain("가상 정보");
  });

  it("given_trend_page_when_read_then_exposes_a_sequential_accessible_analysis_flow", async () => {
    const page = await readDemo("trend-analysis.html");
    for (const label of ["제품군", "공정 노드", "생산 캠퍼스", "분석 기간"])
      expect(page).toContain(label);
    expect(page).toContain('id="run-trend" type="submit" disabled');
    expect(page).toContain('id="trend-summary" role="status"');
    expect(page).toContain('id="trend-chart"');
  });

  it("given_trend_script_when_read_then_renders_in_place_without_navigation", async () => {
    const script = await readDemo("trend-analysis.js");
    expect(script).toContain("event.preventDefault()");
    expect(script).toContain('chart.dataset.trendState = "complete"');
    expect(script).not.toContain("location.href");
    expect(script).not.toContain("window.open");
  });
});
