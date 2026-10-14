import { liveProviderConfig } from "./live-provider-config.mjs";
export async function s24LiveMessage(body, evidence) {
  const model = process.env.S24_LIVE_MODEL;
  const config = liveProviderConfig(model);
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: config.headers,
    body: JSON.stringify({
      ...body,
      model,
      ...config.parameters,
      stream: false,
    }),
    signal: AbortSignal.timeout(90000),
  });
  const record = evidence.at(-1);
  record.provider = config.provider;
  record.model = model;
  record.upstream_status = response.status;
  if (!response.ok) throw new Error(`UPSTREAM_${response.status}`);
  const json = await response.json();
  record.usage = json.usage;
  const message = json.choices?.[0]?.message;
  if (!message || (typeof message.content !== "string" && !message.tool_calls))
    throw new Error("INVALID_PROVIDER_RESPONSE");
  record.returned_tools = message.tool_calls?.map((c) => c.function.name) ?? [];
  record.argument_shapes =
    message.tool_calls?.map((c) => {
      try {
        const a = JSON.parse(c.function.arguments);
        return {
          tool: c.function.name,
          fields: Object.keys(a).filter((k) =>
            [
              "kind",
              "mode",
              "target",
              "coverage",
              "input",
              "recipe_id",
              "dry_run",
            ].includes(k),
          ),
          fixed_values: Object.fromEntries(
            Object.entries(a).filter(
              ([k, v]) =>
                ["kind", "target", "coverage", "input"].includes(k) &&
                [
                  "help",
                  "table-read",
                  "search",
                  "navigate",
                  "form",
                  "method",
                  "page",
                  "table",
                  "list",
                  "link",
                  "visible",
                  "full",
                  "none",
                  "text",
                  "number",
                  "boolean",
                ].includes(v),
            ),
          ),
          dry_run: a.dry_run === true,
          empty_recipe: a.recipe_id === "",
          null_recipe: a.recipe_id === null,
        };
      } catch {
        return { malformed: true };
      }
    }) ?? [];
  return message;
}
