import type {
  AssistantImageAttachment,
  AssistantMessage,
  AssistantModelMessage,
  AssistantRequestBody,
} from "./assistant.types.js";
import { isNonEmptyString } from "utils.js";

const imageDataUrlPattern = /^data:image\/[a-z0-9.+-]+;base64,/i;
const remoteImageUrlPattern = /^https?:\/\/.+/i;

function isAssistantMessage(value: unknown): value is AssistantMessage {
  const message = value as AssistantMessage;

  return (
    value !== null &&
    typeof value === "object" &&
    (message.role === "user" ||
      message.role === "assistant" ||
      message.role === "system") &&
    isNonEmptyString(message.content)
  );
}

export function getMessages(
  body: AssistantRequestBody
): AssistantMessage[] | null {
  if (Array.isArray(body.messages) && body.messages.every(isAssistantMessage)) {
    return body.messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));
  }

  if (isNonEmptyString(body.message)) {
    return [{ role: "user", content: body.message }];
  }

  if (isNonEmptyString(body.input)) {
    return [{ role: "user", content: body.input }];
  }

  return null;
}

export function getThreadId(body: AssistantRequestBody): string {
  if (isNonEmptyString(body.threadId)) {
    return body.threadId;
  }

  return "default";
}

function isSupportedImageUrl(value: string) {
  return imageDataUrlPattern.test(value) || remoteImageUrlPattern.test(value);
}

function normalizeImageAttachment(
  value: unknown
): AssistantImageAttachment | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const attachment = value as Record<string, unknown>;

  if (attachment.type !== "image" || !isNonEmptyString(attachment.url)) {
    return null;
  }

  if (!isSupportedImageUrl(attachment.url)) {
    return null;
  }

  return {
    type: "image",
    url: attachment.url,
    mimeType: isNonEmptyString(attachment.mimeType)
      ? attachment.mimeType
      : undefined,
    name: isNonEmptyString(attachment.name) ? attachment.name : undefined,
    size: typeof attachment.size === "number" ? attachment.size : undefined,
  };
}

export function getImageAttachments(value: unknown): AssistantImageAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((attachment) => {
    const normalizedAttachment = normalizeImageAttachment(attachment);
    return normalizedAttachment ? [normalizedAttachment] : [];
  });
}

function getLastUserMessageIndex(messages: AssistantMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      return index;
    }
  }

  return -1;
}

export function createModelMessages(
  messages: AssistantMessage[],
  imageAttachments: AssistantImageAttachment[]
): AssistantModelMessage[] {
  if (!imageAttachments.length) {
    return messages;
  }

  const lastUserMessageIndex = getLastUserMessageIndex(messages);

  if (lastUserMessageIndex === -1) {
    return messages;
  }

  return messages.map((message, index) => {
    if (index !== lastUserMessageIndex) {
      return message;
    }

    return {
      role: message.role,
      content: [
        { type: "text", text: message.content },
        ...imageAttachments.map((attachment) => ({
          type: "image_url" as const,
          image_url: {
            url: attachment.url,
          },
        })),
      ],
    };
  });
}
