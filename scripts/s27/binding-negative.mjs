export function checkChangedSource(s27, candidate, source, context) {
  if (!candidate || candidate.id !== "search_form")
    return {
      changedSourceValid: false,
      changedSourceRejected: false,
      changedSourceReason: null,
    };
  const value = context.request.slice(0, 1);
  const changed = {
    ...source,
    start: 0,
    end: 1,
    spanDigest: s27.digest(value),
  };
  const independentlyBound = s27.bindArgument(changed, context);
  const fragment = s27.bindFragment(
    candidate,
    new Map([["query", changed]]),
    context,
  );
  const argument = fragment.arguments.get("query");
  return {
    changedSourceValid: independentlyBound.status === "BOUND",
    changedSourceRejected: fragment.status === "NEED_INPUT",
    changedSourceReason:
      argument?.status === "NEED_INPUT" ? argument.reason : null,
  };
}
