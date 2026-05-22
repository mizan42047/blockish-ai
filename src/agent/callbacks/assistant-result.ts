import type { ResultMessage } from "./assistant.types.js";

export function getResultMessages(result: unknown): ResultMessage[] {
  const messages = (result as { messages?: ResultMessage[] }).messages;

  return Array.isArray(messages) ? messages : [];
}

export function getLastMessageContent(result: unknown) {
  const messages = getResultMessages(result);
  const lastMessage = messages.at(-1);

  return lastMessage?.content ?? null;
}

function hasFunctionCallContent(value: unknown): boolean {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.some((item) => (
    item &&
    typeof item === "object" &&
    "type" in item &&
    (item as { type?: unknown }).type === "functionCall"
  ));
}

export function getStringContent(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "text" in item) {
          const text = (item as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        }

        return "";
      })
      .join("");
  }

  return "";
}

export function getLastTextMessageContent(result: unknown): string {
  const messages = getResultMessages(result);

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const content = messages[index]?.content;

    if (hasFunctionCallContent(content)) {
      continue;
    }

    const text = getStringContent(content).trim();

    if (text) {
      return text;
    }
  }

  return "";
}
