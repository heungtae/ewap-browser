import { parseTool } from "./chrome-s19-fixture.mjs";
export const createS23Provider = ({ methodName, caseName }) => {
  return (body, current) => {
    const tool = (name) =>
      body.tools?.find((item) => item.function.name === name);
    const call = (name, args) => ({
      content: "",
      tool_calls: [
        {
          id: `s23-call-${++current.n}-abcdefghijklmnop`,
          type: "function",
          function: { name, arguments: JSON.stringify(args) },
        },
      ],
    });
    if (body.messages[0]?.content?.includes("Classify the user"))
      return { content: '{"route":"ACTION_REQUIRED"}' };

    const results = body.messages
      .filter((message) => message.role === "tool")
      .map((message) => ({
        id: message.tool_call_id,
        value: parseTool(message.content),
      }));
    const readSchema = tool("read_page_resource");
    const source = results.findLast(
      (item) =>
        item.value.status === "AVAILABLE" &&
        item.value.content?.text?.includes(methodName),
    );
    if (readSchema && !source) {
      const search = results.findLast((item) => Array.isArray(item.value.hits));
      if (search?.value.hits?.length) {
        const hit = search.value.hits[0];
        return call("read_page_resource", {
          resource_id: hit.resource_id,
          resource_revision: hit.resource_revision,
          offset: hit.byte_offset,
          max_bytes: 4096,
        });
      }
      const inventory = results.findLast((item) =>
        Array.isArray(item.value.items),
      );
      const script = inventory?.value.items.find(
        (item) =>
          ["inline_script", "external_script"].includes(item.kind) &&
          item.state === "AVAILABLE",
      );
      if (script)
        return call("read_page_resource", {
          resource_id: script.resource_id,
          resource_revision: script.revision,
          offset: 0,
          max_bytes: 4096,
        });
      if (!inventory) return call("list_page_resources", { page_size: 50 });
      return call("search_page_resources", {
        query: methodName,
        page_size: 8,
      });
    }
    const proposal = tool("propose_page_method_call");
    if (
      proposal &&
      results.filter((item) => item.value.invocation === "returned").length <
        (["repeat", "plan"].includes(caseName) ? 2 : 1)
    ) {
      const source = results.findLast(
        (item) =>
          item.value.status === "AVAILABLE" &&
          item.value.content?.text?.includes(methodName),
      )?.value;
      if (!source) return { content: "Source evidence is unavailable." };
      const inventoryMessage = body.messages.findLast((message) =>
        message.content?.startsWith("[UNTRUSTED_EXECUTION_INVENTORY]"),
      );
      const inventory = JSON.parse(inventoryMessage.content.split("\n")[1]);
      const method = inventory.page_methods.find(
        (item) =>
          item.object_path.at(-1) === methodName ||
          item.method_name === methodName,
      );
      if (!method) return { content: "The fixture method was not discovered." };
      if (caseName === "plan" && !inventory.plan && tool("submit_plan")) {
        return call("submit_plan", {
          request_revision: inventory.request_revision,
          goal: "두 번 계산",
          evidence_ids: [inventory.observation_id],
          coverage_note: "읽은 소스와 현재 참조",
          provenance: "script read",
          approval_scope: "single_step",
          steps: [1, 2].map((index) => ({
            intent: `계산 ${index}`,
            capability: "propose_page_method_call",
            method_ref: method.method_ref,
            arguments: [2, 5],
            target_evidence_id: inventory.observation_id,
            postcondition: "반환값 확인",
          })),
        });
      }

      return call("propose_page_method_call", {
        method_ref: method.method_ref,
        source_evidence_id: source.evidence_id,
        arguments: [2, 5],
        purpose: "사용자가 요청한 두 수의 합 계산",
        approval_scope: "single_step",
        approval_reason: "요청한 합산 메서드 호출",
      });
    }
    const goal = tool("report_goal_status");
    if (goal)
      return call("report_goal_status", {
        status: results.some(
          (item) =>
            item.value.invocation === "returned" &&
            item.value.return_data?.available,
        )
          ? "completed"
          : "unknown",
        summary: results.some(
          (item) =>
            item.value.invocation === "returned" &&
            item.value.return_data?.available,
        )
          ? "페이지 메서드가 반환한 합계는 7입니다. 호출 반환만 확인했고 별도의 서버 저장 효과는 주장하지 않습니다."
          : "호출 결과 또는 반환 자료를 확인할 수 없어 목표 완료를 판단하지 못했습니다.",
        observation_id:
          goal.function.parameters.properties.observation_id.enum[0],
      });
    return {
      content: "The request cannot be completed with the available method.",
    };
  };
};
