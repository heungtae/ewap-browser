// Test proxy configuration only. Never persist or print credentials.
export const liveProviderConfig = (model, env = process.env) => {
  const provider = env.LIVE_PROVIDER ?? "openrouter";
  if (!["openrouter", "openai"].includes(provider))
    throw Error("LIVE_PROVIDER must be openrouter or openai");
  const keyEnvironment =
    provider === "openai" ? "OPENAI_API_KEY" : "OPENROUTER_API_KEY";
  if (model && !env[keyEnvironment])
    throw Error(`${keyEnvironment} is required for live tests`);
  const maxOutputTokens = Number(env.LIVE_MAX_OUTPUT_TOKENS ?? 2048);
  if (
    !Number.isSafeInteger(maxOutputTokens) ||
    maxOutputTokens < 512 ||
    maxOutputTokens > 16384
  )
    throw Error("LIVE_MAX_OUTPUT_TOKENS must be an integer from 512 to 16384");
  return {
    provider,
    endpoint:
      provider === "openai"
        ? "https://api.openai.com/v1/chat/completions"
        : "https://openrouter.ai/api/v1/chat/completions",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env[keyEnvironment] ?? ""}`,
    },
    parameters:
      provider === "openai"
        ? { max_completion_tokens: maxOutputTokens, reasoning_effort: "none" }
        : { max_tokens: maxOutputTokens },
  };
};
