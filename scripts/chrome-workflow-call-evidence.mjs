import { createHash } from "node:crypto";
const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const workflowResultEvidence = (messages) =>
  messages
    .filter((message) => message.role === "tool")
    .flatMap((message) => {
      try {
        const value = JSON.parse(
          message.content
            .replace(/^\[UNTRUSTED_TOOL_RESULT\]\n/, "")
            .replace(/\n\[\/UNTRUSTED_TOOL_RESULT\]$/, ""),
        );
        return [
          {
            call_id: message.tool_call_id,
            hash: hash(value),
            status: value.status,
            code: value.code,
            coverage: value.coverage,
            original_read: typeof value.source_text === "string",
            continuation: !!value.next_cursor,
          },
        ];
      } catch {
        return [];
      }
    });
export const workflowReadEvidence = (calls) =>
  (calls ?? [])
    .filter((call) => call.function.name === "read_workflow_resource")
    .map((call) => {
      try {
        const args = JSON.parse(call.function.arguments);
        return {
          call_id: call.id,
          argument_keys: Object.keys(args),
          resource_hash: hash(args.resource_id),
          revision_hash: hash(args.resource_revision),
          cursor: typeof args.cursor === "string",
          max_bytes: args.max_bytes,
        };
      } catch {
        return { call_id: call.id, invalid_json: true };
      }
    });
