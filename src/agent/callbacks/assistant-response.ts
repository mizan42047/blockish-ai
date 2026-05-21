import {
  getLastMessageContent,
  getLastTextMessageContent,
  getStringContent,
} from "./assistant-result.js";
import {
  inferInteractionFromMessage,
  parseInteractionFromMessage,
} from "./assistant-interaction.js";
import { getSchemaPrev } from "./assistant-context.js";
import type { BlockishGeneratedResponse } from "agent/schema.js";
import type {
  AssistantContext,
  AssistantExtensionsContext,
  AssistantInteraction,
  AssistantMetrics,
  AssistantMessage,
  ChatCompatibleResponse,
  ProductManagerResponse,
} from "./assistant.types.js";

function getResponseSummary(
  messages: AssistantMessage[],
  context: AssistantContext | null,
  message: unknown
) {
  const text = getStringContent(message);
  const lowerText = text.toLowerCase();
  const blockCount = context?.blocks?.length ?? 0;
  const contextLabel = context?.scope === "full_page"
    ? "full page"
    : blockCount
    ? `${blockCount} block${blockCount === 1 ? "" : "s"}`
    : "full page";

  if (lowerText.includes("## designer guide")) {
    return `Design guide generated for ${contextLabel}.`;
  }

  if (lowerText.includes("page brief") || lowerText.includes("design scope")) {
    return `Product brief produced for ${contextLabel}.`;
  }

  const questionMatch = text.match(/\*\*Question:\*\*\s*(.+?)(?:\n|$)/);
  if (questionMatch?.[1]) {
    const q = questionMatch[1].trim();
    return `Asked: ${q.length > 80 ? q.slice(0, 80).trim() + "…" : q}`;
  }

  return `Responded using ${contextLabel} context.`;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeInteraction(value: unknown): AssistantInteraction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const interaction = value as Record<string, unknown>;
  const id = typeof interaction.id === "string" && interaction.id.trim()
    ? interaction.id.trim()
    : `q-${Date.now()}`;
  const allowedTypes = ["multi_choice", "single_choice", "yes_no", "text"];
  const type = typeof interaction.type === "string" &&
    allowedTypes.includes(interaction.type)
    ? interaction.type as AssistantInteraction["type"]
    : "single_choice";
  const options = Array.isArray(interaction.options)
    ? interaction.options
      .map((option) => {
        if (!option || typeof option !== "object" || Array.isArray(option)) {
          return null;
        }

        const record = option as Record<string, unknown>;
        const label = typeof record.label === "string"
          ? record.label.trim()
          : "";
        const optionValue = typeof record.value === "string"
          ? record.value.trim()
          : label;

        return label ? { label, value: optionValue || label } : null;
      })
      .filter((option): option is { label: string; value: string } => Boolean(option))
    : undefined;

  return {
    id,
    type,
    ...(typeof interaction.label === "string" && interaction.label.trim()
      ? { label: interaction.label.trim() }
      : {}),
    ...(options?.length ? { options } : {}),
    ...(typeof interaction.allowCustom === "boolean"
      ? { allowCustom: interaction.allowCustom }
      : {}),
    ...(typeof interaction.required === "boolean"
      ? { required: interaction.required }
      : {}),
    ...(interaction.value !== undefined ? { value: interaction.value } : {}),
  };
}

function normalizeTokenValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

function getNestedRecord(
  value: unknown,
  key: string
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const nestedValue = (value as Record<string, unknown>)[key];

  return nestedValue &&
    typeof nestedValue === "object" &&
    !Array.isArray(nestedValue)
    ? (nestedValue as Record<string, unknown>)
    : null;
}

function createEstimatedTokenMetrics(
  messages: AssistantMessage[],
  output: string
): AssistantMetrics {
  const inputText = messages
    .map((message) => message.content)
    .join("\n");
  const inputTokens = Math.ceil(inputText.length / 4);
  const outputTokens = Math.ceil(output.length / 4);

  return {
    durationMs: 0,
    estimatedTokens: true,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}

function getUsageMetadataMetrics(
  value: unknown
): Omit<AssistantMetrics, "durationMs"> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const usage = value as Record<string, unknown>;
  const inputTokens = normalizeTokenValue(
    usage.input_tokens ?? usage.prompt_tokens ?? usage.promptTokens
  );
  const outputTokens = normalizeTokenValue(
    usage.output_tokens ?? usage.completion_tokens ?? usage.completionTokens
  );
  const totalTokens = normalizeTokenValue(
    usage.total_tokens ?? usage.totalTokens
  );

  if (inputTokens === null && outputTokens === null && totalTokens === null) {
    return null;
  }

  return {
    estimatedTokens: false,
    inputTokens,
    outputTokens,
    totalTokens: totalTokens ?? (
      inputTokens !== null && outputTokens !== null
        ? inputTokens + outputTokens
        : null
    ),
  };
}

function getResponseMetadataMetrics(
  value: unknown
): Omit<AssistantMetrics, "durationMs"> | null {
  const tokenUsage = getNestedRecord(value, "tokenUsage") ??
    getNestedRecord(value, "token_usage");

  return getUsageMetadataMetrics(tokenUsage);
}

function getTokenMetrics(
  result: unknown,
  messages: AssistantMessage[],
  output: string
): AssistantMetrics {
  const resultMessages = (result as {
    messages?: Array<{
      response_metadata?: unknown;
      usage_metadata?: unknown;
    }>;
  }).messages ?? [];

  for (let index = resultMessages.length - 1; index >= 0; index -= 1) {
    const message = resultMessages[index];
    const usageMetrics = getUsageMetadataMetrics(message?.usage_metadata) ??
      getResponseMetadataMetrics(message?.response_metadata);

    if (usageMetrics) {
      return {
        durationMs: 0,
        ...usageMetrics,
      };
    }
  }

  return createEstimatedTokenMetrics(messages, output);
}

function normalizeProductManagerResponse(
  structuredResponse: unknown
): ProductManagerResponse | null {
  if (
    !structuredResponse ||
    typeof structuredResponse !== "object" ||
    Array.isArray(structuredResponse)
  ) {
    return null;
  }

  const response = structuredResponse as Record<string, unknown>;
  const answer = typeof response.answer === "string"
    ? response.answer.trim()
    : "";

  if (!answer) {
    return null;
  }

  return {
    answer,
    interaction: normalizeInteraction(response.interaction),
    reasoning: normalizeStringArray(response.reasoning),
    summary: typeof response.summary === "string"
      ? response.summary.trim()
      : "",
    todo: normalizeStringArray(response.todo),
  };
}

function parseJsonObject(text: string): unknown {
  const trimmedText = text.trim();

  if (!trimmedText) {
    return null;
  }

  const codeFenceMatch = trimmedText.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const jsonText = codeFenceMatch?.[1]?.trim() ?? trimmedText;

  try {
    return JSON.parse(jsonText);
  } catch {
    const firstBraceIndex = jsonText.indexOf("{");
    const lastBraceIndex = jsonText.lastIndexOf("}");

    if (firstBraceIndex === -1 || lastBraceIndex <= firstBraceIndex) {
      return null;
    }

    try {
      return JSON.parse(jsonText.slice(firstBraceIndex, lastBraceIndex + 1));
    } catch {
      return null;
    }
  }
}

function getProductManagerResponse(
  result: unknown,
  rawTextMessage: string
): ProductManagerResponse | null {
  const structuredResponse = (result as {
    structuredResponse?: unknown;
  }).structuredResponse;
  const productManagerResponse = normalizeProductManagerResponse(
    structuredResponse
  );

  if (productManagerResponse) {
    return productManagerResponse;
  }

  return normalizeProductManagerResponse(parseJsonObject(rawTextMessage));
}

export function createChatCompatibleResponse(
  result: unknown,
  messages: AssistantMessage[],
  context: AssistantContext | null,
  extensions: AssistantExtensionsContext | null,
  developerSchema: BlockishGeneratedResponse | null,
  streamedMessage?: string
): ChatCompatibleResponse {
  const rawTextMessage =
    streamedMessage?.trim() ||
    getLastTextMessageContent(result) ||
    "";
  const productManagerResponse = getProductManagerResponse(
    result,
    rawTextMessage
  );
  const rawMessage =
    developerSchema?.message ||
    productManagerResponse?.answer ||
    rawTextMessage ||
    "I started the next agent step, but I do not have a final response yet. Please try again.";

  const parsedInteraction = parseInteractionFromMessage(rawMessage);
  const cleanedMessage = parsedInteraction.cleanedMessage;
  const interaction = productManagerResponse?.interaction ??
    parsedInteraction.interaction ??
    inferInteractionFromMessage(cleanedMessage, messages);
  const message = cleanedMessage;

  return {
    message,
    metrics: getTokenMetrics(result, messages, getStringContent(message)),
    reasoning: productManagerResponse?.reasoning ?? [],
    summary: developerSchema?.summary ||
      productManagerResponse?.summary ||
      getResponseSummary(messages, context, message),
    todo: productManagerResponse?.todo ?? [],
    schema: {
      prev: getSchemaPrev(context, extensions),
      new: developerSchema?.schema.new ?? null,
    },
    interaction,
  };
}

export function getStreamedFallbackContent(
  result: unknown,
  streamedMessage: string
) {
  return streamedMessage || getStringContent(getLastMessageContent(result));
}
