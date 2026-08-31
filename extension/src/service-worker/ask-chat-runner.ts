import { digestCanonical } from "../security/canonical.js";
import { fail, isPlainObject } from "../security/validation.js";
import { BusinessMcpClient } from "../profile/business-mcp-client.js";
import { safeChatText } from "../state/tab-chat-session-store.js";
import type { ProviderMessage } from "../providers/types.js";
import { createAskToolExecutor } from "./ask-tool-executor.js";
import { businessBindings, businessMcpTool } from "./ask-tools.js";
import type { AskChatDependencies } from "./ask-chat-dependencies.js";

export const createAskChatRunner =
  (dependencies: AskChatDependencies) =>
  async (payload: unknown): Promise<Record<string, unknown>> => {
    const value = isPlainObject(payload) ? payload : fail("INVALID_ARGUMENT");
    if (
      typeof value.prompt !== "string" ||
      value.prompt.length === 0 ||
      value.prompt.length > 8_000 ||
      value.mode !== "ask"
    )
      return fail("INVALID_ARGUMENT");
    const active = await dependencies.readActive();
    const run = dependencies.coordinator.runs.start(
      active.tabId,
      active.snapshot.frame_id,
      active.snapshot.document_epoch,
      "ask",
    );
    dependencies.bindRun(run.id, active.tabId, dependencies.pageScope(active));
    dependencies.publish(run.id, {
      type: "user_message",
      text: safeChatText(value.prompt),
    });
    dependencies.publish(run.id, {
      type: "run_started",
      mode: "ask",
      permission_mode: dependencies.preferences().permission_mode,
    });
    const modelSnapshot = dependencies.coordinator.modelSnapshot(
      run.id,
      active.snapshot,
    ).snapshot;
    const pageDigest = digestCanonical(active.snapshot);
    const profile = await dependencies
      .resolveProfile(active)
      .catch(() => undefined);
    const bindings = businessBindings(profile?.profile.business_mcp);
    const tool = businessMcpTool(bindings);
    const tools = [...dependencies.askTools, ...(tool ? [tool] : [])];
    const messages: ProviderMessage[] = [
      { role: "system", content: dependencies.systemPrompt },
      ...dependencies.threadContext(active.tabId),
      {
        role: "user",
        content: `[UNTRUSTED_PAGE_PROJECTION]\n${dependencies.serialise(modelSnapshot)}\n[/UNTRUSTED_PAGE_PROJECTION]\n\nUser question: ${safeChatText(value.prompt)}`,
      },
    ];
    const mcp = new BusinessMcpClient(dependencies.providerFetch);
    const executor = createAskToolExecutor({
      snapshot: modelSnapshot,
      tabId: active.tabId,
      runId: run.id,
      screenshotEnabled:
        dependencies.preferences().screenshot_policy !== "disabled",
      tabs: dependencies.chrome.tabs,
      capture: (id) => dependencies.vision(run.id, id),
      remember: (capture) => dependencies.rememberVision(run.id, capture),
      callBusiness: async (toolId, argumentsValue) => {
        const binding = bindings.find(
          (candidate) => candidate.tool_id === toolId,
        );
        if (!binding || !profile) return fail("BUSINESS_MCP_NOT_CONFIGURED");
        return mcp.call(
          binding,
          {
            kind: "CALL_PAGE_BUSINESS_TOOL",
            profile_jws: profile.profile_jws,
            tool_id: binding.tool_id,
            arguments: argumentsValue,
          },
          {
            requestId: crypto.randomUUID(),
            runId: run.id,
            nonce: profile.profile.resolver_request_nonce,
            digest: pageDigest,
          },
        );
      },
      redactTitle: dependencies.redactedTitle,
    });
    for (let step = 1; step <= 3; step += 1) {
      await dependencies.write(
        active.tabId,
        "[ContextPilot][LLM request final]",
        {
          step,
          messages: structuredClone(messages),
          tools: structuredClone(tools),
        },
      );
      let streamed = false;
      let pending = "";
      let timer: ReturnType<typeof setTimeout> | undefined;
      const flush = (): void => {
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
        const text = pending;
        pending = "";
        if (
          text &&
          dependencies.coordinator.runs.byId(run.id)?.phase !== "TERMINAL"
        )
          dependencies.publish(run.id, { type: "assistant_delta", text });
      };
      const response = await (async () => {
        try {
          return await dependencies.provider.chat(
            { messages, tools },
            {
              onDelta: (text) => {
                if (
                  dependencies.coordinator.runs.byId(run.id)?.phase ===
                  "TERMINAL"
                )
                  return;
                streamed = true;
                pending += text;
                if (pending.length >= 4096) flush();
                else if (timer === undefined) timer = setTimeout(flush, 32);
              },
            },
          );
        } finally {
          flush();
        }
      })();
      if (run.phase === "TERMINAL")
        return dependencies.safeFailure("POLICY_DENIED", "run cancelled");
      await dependencies.write(
        active.tabId,
        "[ContextPilot][LLM response final]",
        { step, message: structuredClone(response) },
      );
      if (response.tool_calls.length === 0) {
        if (!response.content) return fail("PROVIDER_UNAVAILABLE");
        dependencies.coordinator.runs.terminal(run.id, "VERIFIED");
        dependencies.releaseVision(run.id);
        if (!streamed)
          dependencies.publish(run.id, {
            type: "assistant_delta",
            text: response.content,
          });
        dependencies.publish(run.id, {
          type: "run_terminal",
          outcome: "VERIFIED",
        });
        return { ok: true, message: response.content };
      }
      messages.push({
        role: "assistant",
        content: response.content,
        tool_calls: response.tool_calls,
      });
      for (const call of response.tool_calls) {
        if (dependencies.coordinator.runs.byId(run.id)?.phase === "TERMINAL")
          return dependencies.safeFailure("POLICY_DENIED", "run cancelled");
        dependencies.publish(run.id, {
          type: "tool_started",
          tool_use_id: call.id,
          tool: call.name,
          summary: "페이지 정보를 확인하는 중입니다.",
        });
        const result = await executor.execute(call);
        dependencies.publish(run.id, {
          type: "tool_finished",
          tool_use_id: call.id,
          result: {
            outcome: "VERIFIED",
            summary: "페이지 읽기 결과를 받았습니다.",
          },
        });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: `[UNTRUSTED_TOOL_RESULT]\n${dependencies.serialise(result)}\n[/UNTRUSTED_TOOL_RESULT]`,
        });
        if (dependencies.coordinator.runs.byId(run.id)?.phase === "TERMINAL")
          return dependencies.safeFailure("POLICY_DENIED", "run cancelled");
      }
    }
    return fail("PROVIDER_UNAVAILABLE");
  };
