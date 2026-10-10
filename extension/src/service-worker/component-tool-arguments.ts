import { isPlainObject } from "../security/validation.js";
import { componentToolSchemas } from "./component-tool-schemas.js";
export const componentToolArguments = (call: {
  name: string;
  args: string;
}): Record<string, unknown> | undefined => {
  const args: unknown = JSON.parse(call.args);
  const schema = componentToolSchemas.find(
    (item) => item.function.name === call.name,
  );
  if (
    !schema ||
    !isPlainObject(args) ||
    typeof args.resource_id !== "string" ||
    typeof args.resource_revision !== "string" ||
    Object.keys(args).some(
      (key) =>
        !Object.hasOwn(schema.function.parameters.properties as object, key),
    )
  )
    return undefined;
  if (
    args.channel === "visual" &&
    (args.cursor !== undefined || args.max_items !== undefined)
  )
    return undefined;
  return args;
};
