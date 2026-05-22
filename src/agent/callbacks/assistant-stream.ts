import { Command } from "@langchain/langgraph";
import type { BlockishGeneratedResponse } from "agent/schema.js";
import { validateGeneratedResponse } from "agent/schema.js";
import type { AssistantAgent } from "./assistant-agent.js";
import { getSchemaPrev } from "./assistant-context.js";
import { createChatCompatibleResponse } from "./assistant-response.js";
import {
  findDeveloperSchemaFromResult,
  logGeneratedSchema,
} from "./assistant-schema-result.js";
import { runWithAssistantToolEvents } from "agent/utility/tool-event-middleware.js";
import type {
  AssistantContext,
  AssistantExtensionsContext,
  AssistantInteraction,
  AssistantInterrupt,
  ChatCompatibleResponse,
  AssistantMessage,
  AssistantModelMessage,
  AssistantRunEvents,
} from "./assistant.types.js";

function getInteractionResponseText(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }

  const response = value as Record<string, unknown>;

  if (typeof response.value === "string") {
    return response.value;
  }

  if (Array.isArray(response.value)) {
    return response.value
      .filter((item): item is string => typeof item === "string")
      .join(", ");
  }

  return "";
}

function createResumeCommand(interactionResponse: unknown): Command {
  const answer = getInteractionResponseText(interactionResponse);

  return new Command({
    resume: {
      decisions: [
        {
          type: "edit",
          editedAction: {
            name: "ask_user",
            args: {
              question: "User answered the question.",
              answer,
            },
          },
        },
      ],
    },
  });
}

function normalizeAskUserInteraction(args: Record<string, unknown>): AssistantInteraction {
  const question = typeof args.question === "string" && args.question.trim()
    ? args.question.trim()
    : "Please provide the missing detail.";
  const type = typeof args.interactionType === "string" &&
    ["multi_choice", "single_choice", "text", "yes_no"].includes(args.interactionType)
    ? args.interactionType as AssistantInteraction["type"]
    : "text";
  const options = Array.isArray(args.options)
    ? args.options.flatMap((option) => {
      if (!option || typeof option !== "object" || Array.isArray(option)) {
        return [];
      }

      const record = option as Record<string, unknown>;
      const label = typeof record.label === "string"
        ? record.label.trim()
        : "";
      const value = typeof record.value === "string"
        ? record.value.trim()
        : label;

      return label ? [{ label, value: value || label }] : [];
    })
    : [];

  return {
    id: `ask_user_${Date.now()}`,
    type,
    label: question,
    ...(options.length ? { options } : {}),
    allowCustom: typeof args.allowCustom === "boolean"
      ? args.allowCustom
      : type !== "yes_no",
    required: true,
  };
}

function getInterruptValue(interrupt: unknown): Record<string, unknown> | null {
  if (!interrupt || typeof interrupt !== "object" || Array.isArray(interrupt)) {
    return null;
  }

  const value = (interrupt as Record<string, unknown>).value;

  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeInterrupt(result: unknown): AssistantInterrupt | null {
  const interrupts = (result as { __interrupt__?: unknown }).__interrupt__;

  if (!Array.isArray(interrupts) || !interrupts.length) {
    return null;
  }

  const value = getInterruptValue(interrupts[0]);
  const actionRequests = value?.actionRequests;

  if (!Array.isArray(actionRequests) || !actionRequests.length) {
    return null;
  }

  const action = actionRequests[0];

  if (!action || typeof action !== "object" || Array.isArray(action)) {
    return null;
  }

  const args = (action as Record<string, unknown>).args;

  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return null;
  }

  const interaction = normalizeAskUserInteraction(args as Record<string, unknown>);
  const message = `**Question:** ${interaction.label ?? "Please provide the missing detail."}`;

  return { interaction, message };
}

function createInterruptedResponse(
  interrupt: AssistantInterrupt,
  context: AssistantContext | null,
  extensions: AssistantExtensionsContext | null
): ChatCompatibleResponse {
  return {
    message: interrupt.message,
    metrics: {
      durationMs: 0,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
    },
    reasoning: [],
    summary: "Waiting for user input.",
    todo: [],
    schema: {
      prev: getSchemaPrev(context, extensions),
      new: null,
    },
    interaction: interrupt.interaction,
  };
}

function getMessageText(message: unknown): string {
  if (typeof message === "string") {
    return message.trim();
  }

  return "";
}

function stripMarkdownQuestionPrefix(message: string): string {
  return message
    .replace(/^#+\s*/gm, "")
    .replace(/\*\*/g, "")
    .replace(/^A few details needed\s*/i, "")
    .replace(/^Question:\s*/i, "")
    .trim();
}

function createTextInteraction(message: string): AssistantInteraction {
  return {
    id: `q-${Date.now()}`,
    type: "text",
    label: stripMarkdownQuestionPrefix(message),
    allowCustom: true,
    required: true,
  };
}

function getExampleOptions(message: string): string[] {
  const examplesMatch = message.match(/\((?:e\.g\.|for example),\s*([^)]+)\)/i);

  if (!examplesMatch?.[1]) {
    return [];
  }

  return examplesMatch[1]
    .split(/\s*,\s*|\s+or\s+/i)
    .map((option) => option.replace(/^["']|["']$/g, "").trim())
    .filter((option) => option.length > 1)
    .slice(0, 5);
}

function createChoiceInteraction(
  message: string,
  options: string[]
): AssistantInteraction {
  return {
    id: `q-${Date.now()}`,
    type: "single_choice",
    label: stripMarkdownQuestionPrefix(message),
    options: options.map((option) => ({
      label: option,
      value: option,
    })),
    allowCustom: true,
    required: true,
  };
}

function createQuestionInteraction(message: string): AssistantInteraction {
  const lowerMessage = message.toLowerCase();
  const exampleOptions = getExampleOptions(message);

  if (exampleOptions.length >= 2) {
    return createChoiceInteraction(message, [
      ...exampleOptions,
      "Something else",
    ]);
  }

  if (
    /\b(cta|ctas)\b/i.test(message) ||
    lowerMessage.includes("call to action") ||
    lowerMessage.includes("button")
  ) {
    return createChoiceInteraction(message, [
      "Shop Now",
      "Learn More",
      "Get Started",
      "Contact Us",
      "Something else",
    ]);
  }

  return createTextInteraction(message);
}

function createFallbackInterrupt(
  response: ChatCompatibleResponse
): AssistantInterrupt | null {
  if (response.schema.new) {
    return null;
  }

  const message = getMessageText(response.message);

  if (!message || !message.includes("?")) {
    return null;
  }

  const interaction = response.interaction ?? createQuestionInteraction(message);

  return {
    interaction: {
      ...interaction,
      label: interaction.label ?? stripMarkdownQuestionPrefix(message),
    },
    message,
  };
}

async function invokeAgentResponseInner(
  agent: AssistantAgent,
  modelMessages: AssistantModelMessage[],
  summaryMessages: AssistantMessage[],
  context: AssistantContext | null,
  extensions: AssistantExtensionsContext | null,
  signal: AbortSignal,
  events: AssistantRunEvents = {},
  threadId = "default",
  interactionResponse?: unknown
): Promise<ChatCompatibleResponse> {
  let streamedMessage = "";
  let result: unknown;
  const input = interactionResponse
    ? createResumeCommand(interactionResponse)
    : { messages: modelMessages };
  const runConfig = {
    configurable: { thread_id: threadId },
    signal,
  };

  if (events.onDelta) {
    await events.onStatus?.("Thinking through the request");

    const run = await agent.streamEvents(
      input,
      { ...runConfig, version: "v3" }
    );
    let hasStartedWriting = false;

    for await (const message of run.messages) {
      for await (const token of message.text) {
        if (!hasStartedWriting) {
          hasStartedWriting = true;
          await events.onStatus?.("Writing response");
        }

        streamedMessage += token;
        await events.onDelta(token, {
          agent: "product_manager",
          source: "assistant_message",
        });
      }
    }

    await events.onStatus?.("Finalizing response");

    result = await run.output;
  } else {
    await events.onStatus?.("Thinking through the request");

    result = await agent.invoke(
      input,
      runConfig
    );

    await events.onStatus?.("Finalizing response");
  }

  const interrupt = normalizeInterrupt(result);

  if (interrupt) {
    await events.onInterrupt?.(interrupt);
    return createInterruptedResponse(interrupt, context, extensions);
  }

  const structuredResult = (result as Record<string, unknown>).structuredResponse;
  const directValidation = validateGeneratedResponse(structuredResult);
  const developerSchema: BlockishGeneratedResponse | null = directValidation.value ??
    findDeveloperSchemaFromResult(result);

  if (developerSchema) {
    logGeneratedSchema("agent", developerSchema.schema.new);
  }

  const response = createChatCompatibleResponse(
    result,
    summaryMessages,
    context,
    extensions,
    developerSchema,
    streamedMessage
  );
  const fallbackInterrupt = createFallbackInterrupt(response);

  if (fallbackInterrupt) {
    await events.onInterrupt?.(fallbackInterrupt);
    return createInterruptedResponse(fallbackInterrupt, context, extensions);
  }

  if (response.interaction) {
    await events.onInteraction?.(response.interaction, response.message);
  }

  return response;
}

export async function invokeAgentResponse(
  agent: AssistantAgent,
  modelMessages: AssistantModelMessage[],
  summaryMessages: AssistantMessage[],
  context: AssistantContext | null,
  extensions: AssistantExtensionsContext | null,
  signal: AbortSignal,
  events: AssistantRunEvents = {},
  threadId = "default",
  interactionResponse?: unknown
): Promise<ChatCompatibleResponse> {
  return runWithAssistantToolEvents(events, () => invokeAgentResponseInner(
    agent,
    modelMessages,
    summaryMessages,
    context,
    extensions,
    signal,
    events,
    threadId,
    interactionResponse
  ));
}
