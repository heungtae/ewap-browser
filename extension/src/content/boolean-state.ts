/** Missing or malformed public ARIA boolean values remain unknown. */
export const ariaBooleanState = (
  element: Element,
  field: "selected" | "expanded" | "pressed",
): Partial<Record<"selected" | "expanded" | "pressed", boolean>> => {
  const value = element.getAttribute(`aria-${field}`);
  return value === "true"
    ? { [field]: true }
    : value === "false"
      ? { [field]: false }
      : {};
};
