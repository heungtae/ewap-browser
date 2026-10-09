// Test proxy configuration only. Never persist or print credentials.
export const liveProviderConfig = (model, env = process.env) => {
  const provider = env.LIVE_PROVIDER ?? "openrouter";
  if (!["openrouter", "openai"].includes(provider))
    throw Error("LIVE_PROVIDER must be openrouter or openai");
  const keyEnvironment =
    provider === "openai" ? "OPENAI_API_KEY" : "OPENROUTER_API_KEY";
  if (model && !env[keyEnvironment])
    throw Error(`${keyEnvironment} is required for live tests`);
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
        ? { max_completion_tokens: 2048, reasoning_effort: "none" }
        : { max_tokens: 2048 },
  };
};
