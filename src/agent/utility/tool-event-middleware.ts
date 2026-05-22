import { AsyncLocalStorage } from "node:async_hooks";
import { createMiddleware } from "langchain";
import type {
  AssistantRunEvents,
  AssistantToolEvent,
} from "agent/callbacks/assistant.types.js";

const toolEventStorage = new AsyncLocalStorage<AssistantRunEvents>();
const maxLoggedOutputLength = 12000;
const toolCallCountStorage = new AsyncLocalStorage<Map<string, number>>();

export type ToolEventMiddlewareOptions = {
  maxCalls?: Record<string, number>;
};

function getToolDisplayName(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getToolCallRecord(request: unknown): Record<string, unknown> {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return {};
  }

  const toolCall = (request as Record<string, unknown>).toolCall;

  return toolCall && typeof toolCall === "object" && !Array.isArray(toolCall)
    ? toolCall as Record<string, unknown>
    : {};
}

function getToolName(request: unknown): string {
  const toolCall = getToolCallRecord(request);

  return typeof toolCall.name === "string" && toolCall.name.trim()
    ? toolCall.name.trim()
    : "unknown_tool";
}

function getToolInput(request: unknown): unknown {
  const toolCall = getToolCallRecord(request);

  return toolCall.args ?? null;
}

function normalizeToolOutput(output: unknown): unknown {
  if (typeof output === "string") {
    return output.length > maxLoggedOutputLength
      ? `${output.slice(0, maxLoggedOutputLength)}...[truncated]`
      : output;
  }

  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return output;
  }

  const record = output as Record<string, unknown>;
  const content = record.content;

  if (typeof content === "string") {
    return normalizeToolOutput(content);
  }

  try {
    return JSON.parse(JSON.stringify(output));
  } catch {
    return String(output);
  }
}

async function notifyToolStart(
  events: AssistantRunEvents | undefined,
  event: AssistantToolEvent
): Promise<void> {
  console.log(`[Blockish AI][tool:start] ${event.agent}.${event.name}`, {
    input: event.input,
  });

  await events?.onToolStart?.(event);
  await events?.onStatus?.(`Using ${getToolDisplayName(event.name)}`);
}

async function notifyToolEnd(
  events: AssistantRunEvents | undefined,
  event: AssistantToolEvent
): Promise<void> {
  const logMethod = event.error ? console.error : console.log;

  logMethod(`[Blockish AI][tool:end] ${event.agent}.${event.name}`, {
    durationMs: event.durationMs,
    status: event.status,
    output: event.output,
    error: event.error,
  });

  await events?.onToolEnd?.(event);
  await events?.onStatus?.(
    event.error
      ? `${getToolDisplayName(event.name)} failed`
      : `${getToolDisplayName(event.name)} ready`
  );
}

export async function runWithAssistantToolEvents<T>(
  events: AssistantRunEvents,
  callback: () => Promise<T>
): Promise<T> {
  return toolEventStorage.run(events, () => (
    toolCallCountStorage.run(new Map(), callback)
  ));
}

function getToolCallCountKey(agent: string, name: string): string {
  return `${agent}:${name}`;
}

function incrementToolCallCount(agent: string, name: string): number {
  const store = toolCallCountStorage.getStore();

  if (!store) {
    return 1;
  }

  const key = getToolCallCountKey(agent, name);
  const nextCount = (store.get(key) ?? 0) + 1;
  store.set(key, nextCount);

  return nextCount;
}

export function createToolEventMiddleware(
  agent: string,
  options: ToolEventMiddlewareOptions = {}
) {
  return createMiddleware({
    name: `${agent.replace(/\W+/g, "_")}_tool_events`,
    wrapToolCall: async (request: any, handler: any) => {
      const events = toolEventStorage.getStore();
      const name = getToolName(request);
      const input = getToolInput(request);
      const startedAt = Date.now();
      const callCount = incrementToolCallCount(agent, name);
      const maxCalls = options.maxCalls?.[name];

      if (typeof maxCalls === "number" && callCount > maxCalls) {
        const error = new Error(
          `${agent}.${name} already ran ${maxCalls} time${maxCalls === 1 ? "" : "s"} in this request. Use the previous tool result and finish the response.`
        );

        await notifyToolEnd(events, {
          agent,
          durationMs: 0,
          error,
          input,
          name,
          status: "blocked",
        });

        return error.message;
      }

      await notifyToolStart(events, {
        agent,
        name,
        input,
      });

      try {
        const output = await handler(request);
        const event: AssistantToolEvent = {
          agent,
          durationMs: Date.now() - startedAt,
          input,
          name,
          output: normalizeToolOutput(output),
          status: "success",
        };

        await notifyToolEnd(events, event);

        return output;
      } catch (error) {
        await notifyToolEnd(events, {
          agent,
          durationMs: Date.now() - startedAt,
          error,
          input,
          name,
          status: "error",
        });

        throw error;
      }
    },
  });
}
