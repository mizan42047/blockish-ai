type ExtractedAgentOutput<T> = {
  parsedCandidate: unknown;
  rawText: string | null;
  value: T | null;
};

function getTextFromContent(content: unknown): string | null {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return null;
  }

  const text = content
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }

      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return "";
      }

      const record = item as Record<string, unknown>;

      return typeof record.text === "string" ? record.text : "";
    })
    .filter(Boolean)
    .join("\n");

  return text || null;
}

function getLastMessageText(result: unknown): string | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return null;
  }

  const messages = (result as { messages?: unknown }).messages;

  if (!Array.isArray(messages)) {
    return null;
  }

  for (const message of [...messages].reverse()) {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      continue;
    }

    const text = getTextFromContent(
      (message as { content?: unknown }).content
    );

    if (text?.trim()) {
      return text.trim();
    }
  }

  return null;
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);

  return match?.[1]?.trim() ?? trimmed;
}

function parseJsonObject(text: string): unknown {
  const stripped = stripJsonFence(text);

  try {
    return JSON.parse(stripped);
  } catch {
    // Continue to balanced-object extraction below.
  }

  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");

  if (start === -1 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function extractAgentStructuredOutput<T>(
  result: unknown,
  normalize: (value: unknown) => T | null
): ExtractedAgentOutput<T> {
  if (result && typeof result === "object" && !Array.isArray(result)) {
    const structuredResponse = (result as { structuredResponse?: unknown })
      .structuredResponse;
    const structuredValue = normalize(structuredResponse);

    if (structuredValue) {
      return {
        parsedCandidate: structuredResponse,
        rawText: null,
        value: structuredValue,
      };
    }
  }

  const rawText = getLastMessageText(result);
  const parsed = rawText ? parseJsonObject(rawText) : null;

  return {
    parsedCandidate: parsed,
    rawText,
    value: normalize(parsed),
  };
}
