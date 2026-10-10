const sensitive =
  /password|passwd|secret|token|otp|mfa|credential|api.?key|비밀번호|인증/i;
export const sensitiveComponentElement = (element: Element): boolean => {
  let parent: Element | null = element;
  while (parent) {
    if (
      sensitive.test(
        [
          parent.id,
          parent.getAttribute("name"),
          parent.getAttribute("aria-label"),
          parent.getAttribute("autocomplete"),
        ].join(" "),
      )
    )
      return true;
    parent = parent.parentElement;
  }
  const cell = element.closest('td,th,[role="cell"],[role="gridcell"]');
  const table = cell?.closest('table,[role="table"],[role="grid"]');
  if (cell && table) {
    const index =
      Number(cell.getAttribute("aria-colindex")) ||
      Array.from(cell.parentElement?.children ?? []).indexOf(cell) + 1;
    const header = table.querySelectorAll('thead th,[role="columnheader"]')[
      index - 1
    ];
    if (header && sensitive.test(header.textContent ?? "")) return true;
  }
  return false;
};
