// Verify a different, individually valid source cannot reuse the selected
// candidate's original source digest.
export function changedSourceCheck(s27, selected, binding, name) {
  if (!selected || !name) return null;
  const original = binding.sources.get(name);
  if (!original) return null;
  let sources = binding.sources;
  let context = binding.bindingContext;
  if (name === "query") {
    const replacement = context.request.slice(0, 1);
    const changed = {
      ...original,
      start: 0,
      end: 1,
      spanDigest: s27.digest(replacement),
    };
    sources = new Map([[name, changed]]);
  } else if (name === "dataset") {
    const record = context.observed.get("acquired");
    if (!record) return null;
    context = {
      ...context,
      observed: new Map([
        ["acquired", { ...record, value: "dataset:different" }],
      ]),
    };
  } else return null;
  const independent = s27.bindArgument(sources.get(name), context);
  const result = s27.bindFragment(selected, sources, context);
  const argument = result.arguments.get(name);
  return {
    sourceValid: independent.status === "BOUND",
    rejected: result.status === "NEED_INPUT",
    reason: argument?.status === "NEED_INPUT" ? argument.reason : null,
  };
}
