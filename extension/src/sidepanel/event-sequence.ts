/** Live gaps require resync; authoritative recovery may omit expired approvals. */
export const eventSequenceDecision = (
  previous: number,
  sequence: number,
  recovered = false,
): "ignore" | "resync" | "apply" => {
  if (sequence <= previous) return "ignore";
  if (!recovered && sequence > previous + 1) return "resync";
  return "apply";
};
