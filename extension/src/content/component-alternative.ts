import { observeComponent, visibleComponent } from "./component-observation.js";
import { digestCanonical } from "../security/canonical.js";
export const componentAlternative = async (
  element: Element,
  idFor: (element: Element) => string,
  epoch: string,
) => {
  if (
    element.matches(
      'table,[role="table"],[role="grid"],ul,ol,[role="list"],[role="tree"]',
    )
  )
    return undefined;
  const refs = [
    element.getAttribute("aria-details"),
    element.getAttribute("aria-describedby"),
  ]
    .filter((item): item is string => !!item)
    .join(" ")
    .split(/\s+/)
    .slice(0, 20);
  for (const ref of refs) {
    const target = element.ownerDocument.getElementById(ref);
    if (
      !target ||
      target === element ||
      !target.matches('table,[role="table"],[role="grid"]') ||
      !visibleComponent(target)
    )
      continue;
    const observed = observeComponent(target);
    return {
      resource_id: idFor(target),
      resource_revision: await digestCanonical({
        epoch,
        ...observed,
        alternative: null,
      }),
      rows: observed.rows,
      has_eof: observed.complete,
      ...(observed.total === undefined && !observed.complete
        ? {}
        : { total_count: observed.total ?? observed.rows.length }),
      correspondence: "EXPLICIT_DOM_ASSOCIATION_NOT_VALUE_CORROBORATION",
    };
  }
  return undefined;
};
