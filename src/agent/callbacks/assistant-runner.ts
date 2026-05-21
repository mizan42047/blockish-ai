import { getAssistantAgent } from "./assistant-agent.js";
import {
  getAssistantContext,
  getAssistantExtensionsContext,
} from "./assistant-context.js";
import {
  createModelMessages,
  getImageAttachments,
  getMessages,
  getThreadId,
} from "./assistant-request.js";
import { invokeAgentResponse } from "./assistant-stream.js";
import type {
  AssistantRunEvents,
  AssistantRequestBody,
  ChatCompatibleResponse,
} from "./assistant.types.js";

export class AssistantRequestError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "AssistantRequestError";
    this.statusCode = statusCode;
  }
}

export async function runAssistantRequest(
  body: AssistantRequestBody,
  signal: AbortSignal,
  events: AssistantRunEvents = {}
): Promise<ChatCompatibleResponse> {
  const startedAt = performance.now();
  await events.onStatus?.("Reading your request");

  const messages = getMessages(body);

  if (!messages) {
    throw new AssistantRequestError(
      400,
      "message, input, or messages is required"
    );
  }

  await events.onStatus?.("Preparing editor context");

  const assistantContext = getAssistantContext(body.assistantContext);
  const assistantExtensionsContext = getAssistantExtensionsContext(
    body.classManager
  );
  const imageAttachments = getImageAttachments(body.attachments);
  const modelMessages = createModelMessages(messages, imageAttachments);
  const threadId = getThreadId(body);

  await events.onStatus?.("Starting Product Manager");

  const agent = await getAssistantAgent();

  const response = await invokeAgentResponse(
    agent,
    modelMessages,
    messages,
    assistantContext,
    assistantExtensionsContext,
    signal,
    events,
    threadId,
    body.interactionResponse
  );

  console.log(response);

  return {
    ...response,
    metrics: {
      ...response.metrics,
      durationMs: Math.round(performance.now() - startedAt),
    },
  };
}
