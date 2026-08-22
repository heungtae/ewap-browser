const product = document.querySelector("#product-family");
const process = document.querySelector("#process-node");
const campus = document.querySelector("#fabrication-campus");
const period = document.querySelector("#analysis-period");
const form = document.querySelector("#trend-form");
const run = document.querySelector("#run-trend");
const reset = document.querySelector("#reset-analysis");
const summary = document.querySelector("#trend-summary");
const state = document.querySelector("#chart-state");
const chart = document.querySelector("#trend-chart");
const line = document.querySelector("#yield-line");
const points = document.querySelector("#yield-points");
const controls = [product, process, campus, period];

const unlock = (current, next) => {
  current.addEventListener("change", () => {
    current.disabled = true;
    next.disabled = false;
    next.focus();
  });
};
unlock(product, process);
unlock(process, campus);
unlock(campus, period);
period.addEventListener("change", () => {
  period.disabled = true;
  run.disabled = false;
  run.focus();
});

const seriesFor = () => {
  const base =
    product.value === "AI 가속기"
      ? 95.1
      : product.value === "차량용 플랫폼"
        ? 94.4
        : 94.8;
  const node =
    process.value === "2nm GAA"
      ? 0.22
      : process.value === "3nm FinFET"
        ? 0.12
        : 0.06;
  const periodAdjustment =
    period.value === "최근 4주" ? 0.08 : period.value === "최근 8주" ? 0.04 : 0;
  return [
    base - 0.75,
    base - 0.48,
    base - 0.32,
    base - 0.2,
    base - 0.05,
    base + node - periodAdjustment,
  ];
};
const render = (values) => {
  const x = [55, 180, 305, 430, 555, 680];
  const y = values.map((value) => 235 - ((value - 90) / 10) * 195);
  line.setAttribute(
    "d",
    x
      .map(
        (item, index) => `${index ? "L" : "M"}${item} ${y[index].toFixed(1)}`,
      )
      .join(" "),
  );
  points.replaceChildren(
    ...x.map((item, index) => {
      const point = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle",
      );
      point.setAttribute("class", "yield-point");
      point.setAttribute("cx", String(item));
      point.setAttribute("cy", y[index].toFixed(1));
      point.setAttribute("r", "5");
      return point;
    }),
  );
};
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const values = seriesFor();
  render(values);
  const delta = (values.at(-1) - values[0]).toFixed(2);
  const condition = `${product.value} / ${process.value} / ${campus.value} / ${period.value}`;
  run.disabled = true;
  reset.hidden = false;
  state.textContent = "분석 완료";
  state.classList.add("complete");
  chart.setAttribute("aria-label", `${condition} 수율 추세 차트`);
  chart.dataset.trendState = "complete";
  summary.textContent = `추세 차트 생성 완료: ${condition}. 최종 수율 ${values.at(-1).toFixed(2)}%, 시작 대비 ${delta}%p 변화.`;
});
reset.addEventListener("click", () => {
  form.reset();
  controls.forEach((control, index) => {
    control.disabled = index !== 0;
  });
  run.disabled = true;
  reset.hidden = true;
  state.textContent = "조건 입력 대기";
  state.classList.remove("complete");
  chart.removeAttribute("data-trend-state");
  chart.setAttribute("aria-label", "분석 실행 전 수율 추세 차트");
  line.setAttribute("d", "M55 210H690");
  points.replaceChildren();
  summary.textContent =
    "분석 조건을 선택하면 수율 차트가 이 영역에서 갱신됩니다.";
  product.focus();
});
