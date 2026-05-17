import type { Request, Response } from "express";
import { createDeepAgent, type SubAgent } from "deepagents";
import { getBlockishOverviewContext } from "agent/context/document-context.js";
import { createProductManagerAgent } from "agent/main-agent.js";
import { createDesignerSubAgent } from "agent/subagents/designer-agent.js";
import { collectPageVisualAssets } from "agent/tools/index.js";
import type { CreateModelConfig } from "agent/utility/create-model.js";
import { config } from "config.js";
import { isNonEmptyString, sendErrorResponse } from "utils.js";

type AssistantMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type AssistantImageContent = {
  type: "image_url";
  image_url: {
    url: string;
  };
};

type AssistantTextContent = {
  type: "text";
  text: string;
};

type AssistantModelMessage = Omit<AssistantMessage, "content"> & {
  content: string | Array<AssistantTextContent | AssistantImageContent>;
};

type AssistantImageAttachment = {
  mimeType?: string;
  name?: string;
  size?: number;
  type: "image";
  url: string;
};

type AssistantRequestBody = {
  assistantContext?: unknown;
  attachments?: unknown;
  apiKey?: unknown;
  classManager?: unknown;
  input?: unknown;
  interactionResponse?: unknown;
  message?: unknown;
  messages?: unknown;
};

type AssistantContext = {
  blocks?: unknown[];
  mode?: string;
  scope?: string;
};

type AssistantExtensionsContext = {
  classManager?: unknown[];
};

type ChatCompatibleResponse = {
  interaction?: AssistantInteraction;
  message: unknown;
  reasoning: string[];
  summary: string;
  schema: {
    prev: unknown | null;
    new: unknown | null;
  };
};

type TaskCall = {
  description: string;
  subagentType: string;
};

type DelegatedDesignResult = {
  message: string;
  schemaNew: unknown | null;
  summary?: string;
};

type AssistantInteractionOption = {
  label: string;
  value: string;
};

type AssistantInteraction = {
  allowCustom?: boolean;
  id: string;
  label?: string;
  options?: AssistantInteractionOption[];
  required?: boolean;
  type:
    | "multi_choice"
    | "single_choice"
    | "yes_no";
  value?: unknown;
};

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

function getMessages(body: AssistantRequestBody): AssistantMessage[] | null {
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

function isSupportedImageUrl(value: string) {
  return imageDataUrlPattern.test(value) || remoteImageUrlPattern.test(value);
}

function normalizeImageAttachment(value: unknown): AssistantImageAttachment | null {
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

function getImageAttachments(value: unknown): AssistantImageAttachment[] {
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

function createModelMessages(
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

type ResultMessage = {
  _getType?: () => string;
  content?: unknown;
  role?: unknown;
  type?: unknown;
};

function getResultMessages(result: unknown): ResultMessage[] {
  const messages = (result as { messages?: ResultMessage[] }).messages;

  return Array.isArray(messages) ? messages : [];
}

function getLastMessageContent(result: unknown) {
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

function getMessageType(message: ResultMessage): string {
  if (typeof message._getType === "function") {
    return message._getType();
  }

  if (typeof message.type === "string") {
    return message.type;
  }

  if (typeof message.role === "string") {
    return message.role;
  }

  return "";
}

function isAssistantResultMessage(message: ResultMessage): boolean {
  const type = getMessageType(message);

  return type === "ai" || type === "assistant";
}

function getStringContent(value: unknown): string {
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

function getAssistantTextMessageContent(result: unknown): string {
  return getResultMessages(result)
    .filter(isAssistantResultMessage)
    .map((message) => message.content)
    .filter((content) => !hasFunctionCallContent(content))
    .map((content) => getStringContent(content).trim())
    .filter(Boolean)
    .join("\n\n");
}

function getLastTextMessageContent(result: unknown): string {
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

function getTaskCallFromContent(value: unknown): TaskCall | null {
  if (!Array.isArray(value)) {
    return null;
  }

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const contentItem = item as {
      functionCall?: {
        args?: unknown;
        name?: unknown;
      };
      type?: unknown;
    };

    if (
      contentItem.type !== "functionCall" ||
      contentItem.functionCall?.name !== "task"
    ) {
      continue;
    }

    const rawArgs = contentItem.functionCall.args;
    let args: Record<string, unknown>;

    try {
      args = typeof rawArgs === "string"
        ? JSON.parse(rawArgs) as Record<string, unknown>
        : rawArgs as Record<string, unknown>;
    } catch (error) {
      continue;
    }

    if (!args || typeof args !== "object") {
      continue;
    }
    const description = args.description;
    const subagentType = args.subagent_type;

    if (isNonEmptyString(description) && isNonEmptyString(subagentType)) {
      return {
        description,
        subagentType,
      };
    }
  }

  return null;
}

function getAssistantContext(value: unknown): AssistantContext | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as AssistantContext;
}

function getAssistantExtensionsContext(
  classManager: unknown
): AssistantExtensionsContext | null {
  return {
    classManager: Array.isArray(classManager) ? classManager : [],
  };
}

function getSchemaPrev(
  context: AssistantContext | null,
  extensions: AssistantExtensionsContext | null
) {
  if (!context?.blocks?.length && !extensions?.classManager?.length) {
    return null;
  }

  return {
    scope: context?.scope ?? "selection",
    mode: context?.mode ?? "blocks",
    extensions: {
      classManager: extensions?.classManager ?? [],
    },
    blocks: context?.blocks ?? [],
  };
}

function getResponseSummary(
  messages: AssistantMessage[],
  context: AssistantContext | null
) {
  const lastUserMessage = messages
    .filter((message) => message.role === "user")
    .at(-1)?.content;
  const blockCount = context?.blocks?.length ?? 0;
  const contextSummary = context?.scope === "full_page"
    ? "full page"
    : blockCount
    ? `${blockCount} selected block${blockCount === 1 ? "" : "s"}`
    : "full page";

  if (!lastUserMessage) {
    return `Assistant reviewed the ${contextSummary} context.`;
  }

  return `Assistant responded to "${lastUserMessage}" using ${contextSummary} context.`;
}

function getResponseReasoning(
  messages: AssistantMessage[],
  context: AssistantContext | null,
  message: unknown
) {
  const steps = ["Read the latest user request."];
  const blockCount = context?.blocks?.length ?? 0;

  if (context?.scope === "full_page") {
    steps.push("Checked the full-page editor context.");
  } else if (blockCount) {
    steps.push(
      `Checked ${blockCount} selected block${blockCount === 1 ? "" : "s"} from context.`
    );
  } else {
    steps.push("Checked the full-page context.");
  }

  const text = getStringContent(message).toLowerCase();
  const hasQuestion = text.includes("**question:**") || text.includes("question:");

  if (hasQuestion) {
    steps.push("Found the highest-priority missing detail.");
    steps.push("Asked one focused follow-up question.");
    return steps;
  }

  const hasUserMessage = messages.some((item) => item.role === "user");
  if (hasUserMessage) {
    steps.push("Prepared the response from the available page requirements.");
  }

  return steps;
}

function createSingleChoiceInteraction(
  id: string,
  label: string,
  options: AssistantInteractionOption[]
): AssistantInteraction {
  return {
    id,
    type: "single_choice",
    label,
    options,
    allowCustom: true,
    required: true,
  };
}

function getAssistantInteraction(message: unknown): AssistantInteraction | undefined {
  return undefined;
}

function createRunnableSubAgent(subAgent: SubAgent) {
  return createDeepAgent({
    name: subAgent.name,
    model: subAgent.model as never,
    systemPrompt: subAgent.systemPrompt,
    tools: subAgent.tools ?? [],
  });
}

async function runAgentForText(
  agent: ReturnType<typeof createDeepAgent>,
  prompt: string,
  signal: AbortSignal
) {
  const runnable = agent as {
    invoke: (
      state: { messages: AssistantMessage[] },
      config?: { recursionLimit?: number; signal?: AbortSignal }
    ) => Promise<unknown>;
  };
  const result = await runnable.invoke(
    {
      messages: [{ role: "user", content: prompt }],
    },
    {
      recursionLimit: 80,
      signal,
    }
  );

  return getAssistantTextMessageContent(result) ||
    getLastTextMessageContent(result) ||
    getStringContent(getLastMessageContent(result));
}

function createDesignerDebugPrompt(brief: string, assetPack: unknown) {
  return [
    brief,
    "",
    "Use this backend-collected visual asset pack in the design guide.",
    "Do not say you will collect assets; the assets are already provided.",
    "Include an Assets section with exact placements.",
    "For icons, Blockish accepts inline SVG only, so use the svg field.",
    "",
    "Visual asset pack:",
    JSON.stringify(assetPack, null, 2),
  ].join("\n");
}

function getDesignerBrief(result: unknown): string | null {
  const taskCall = getTaskCallFromContent(getLastMessageContent(result));

  if (taskCall?.subagentType === "designer") {
    return taskCall.description;
  }

  const text = getLastTextMessageContent(result).trim();
  const lowerText = text.toLowerCase();
  const hasQuestion = lowerText.includes("**question:**") ||
    lowerText.includes("question:");
  const looksLikeBrief = lowerText.includes("page brief") ||
    (lowerText.includes("page type") &&
      lowerText.includes("primary goal") &&
      lowerText.includes("target audience"));

  if (!hasQuestion && looksLikeBrief) {
    return text;
  }

  return null;
}

async function runDelegatedDesignFlow(
  result: unknown,
  modelConfig: CreateModelConfig,
  blockishOverviewContext: string,
  signal: AbortSignal
): Promise<DelegatedDesignResult | null> {
  const designerBrief = getDesignerBrief(result);

  if (!designerBrief) {
    return null;
  }

  const designer = createRunnableSubAgent(
    createDesignerSubAgent({
      blockishOverviewContext,
      modelConfig,
    })
  );
  const assetPack = await collectPageVisualAssets(designerBrief);
  const designGuide = await runAgentForText(
    designer,
    createDesignerDebugPrompt(designerBrief, assetPack),
    signal
  );

  if (!designGuide.trim()) {
    return null;
  }

  return {
    message: [
      "## Product Manager Brief Sent To Designer",
      "",
      designerBrief,
      "",
      "## Designer Guide",
      "",
      designGuide,
    ].join("\n"),
    schemaNew: null,
    summary: "Returned the Product Manager brief and designer guide for debugging.",
  };
}

function createChatCompatibleResponse(
  result: unknown,
  messages: AssistantMessage[],
  context: AssistantContext | null,
  extensions: AssistantExtensionsContext | null,
  streamedMessage?: string,
  delegatedResult?: DelegatedDesignResult | null
): ChatCompatibleResponse {
  const finalMessage =
    delegatedResult?.message ||
    streamedMessage?.trim() ||
    getLastTextMessageContent(result) ||
    "I started the next agent step, but I do not have a final response yet. Please try again.";

  return {
    message: finalMessage,
    reasoning: getResponseReasoning(messages, context, finalMessage),
    summary: delegatedResult?.summary ?? getResponseSummary(messages, context),
    schema: {
      prev: getSchemaPrev(context, extensions),
      new: delegatedResult?.schemaNew ?? null,
    },
    interaction: getAssistantInteraction(finalMessage),
  };
}

function writeSse(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function streamAgentResponse(
  res: Response,
  agent: ReturnType<typeof createProductManagerAgent>,
  modelMessages: AssistantModelMessage[],
  summaryMessages: AssistantMessage[],
  context: AssistantContext | null,
  extensions: AssistantExtensionsContext | null,
  modelConfig: CreateModelConfig,
  blockishOverviewContext: string,
  signal: AbortSignal
) {
  let streamedMessage = "";
  const run = await agent.streamEvents(
    { messages: modelMessages },
    {
      version: "v3",
      signal,
    }
  );

  for await (const message of run.messages) {
    for await (const token of message.text) {
      streamedMessage += token;
      writeSse(res, "delta", { delta: token });
    }
  }

  const result = await run.output;
  const delegatedResult = await runDelegatedDesignFlow(
    result,
    modelConfig,
    blockishOverviewContext,
    signal
  );
  const responseData = createChatCompatibleResponse(
    result,
    summaryMessages,
    context,
    extensions,
    streamedMessage || getStringContent(getLastMessageContent(result)),
    delegatedResult
  );

  writeSse(res, "final", {
    response: {
      ok: true,
      data: responseData,
    },
  });
  writeSse(res, "done", "[DONE]");
}

export async function assistantCallback(
  req: Request<{}, unknown, AssistantRequestBody>,
  res: Response
) {
  try {
    const body = req.body ?? {};
    const messages = getMessages(body);

    if (!messages) {
      return sendErrorResponse(
        res,
        400,
        "message, input, or messages is required"
      );
    }

    const assistantContext = getAssistantContext(body.assistantContext);
    const assistantExtensionsContext = getAssistantExtensionsContext(
      body.classManager
    );
    const imageAttachments = getImageAttachments(body.attachments);
    const modelMessages = createModelMessages(messages, imageAttachments);
    const blockishOverviewContext = await getBlockishOverviewContext();
    const modelConfig = {
      apiKey: config.aiApiKey,
      model: config.aiModel,
      provider: config.aiProvider,
      temperature: 0.5,
      siteName: "Blockish AI",
      siteUrl: config.openRouterSiteUrl,
    };
    const agent = createProductManagerAgent({
      blockishOverviewContext,
      modelConfig,
    });

    const abortController = new AbortController();
    let streamCompleted = false;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    res.on("close", () => {
      if (!streamCompleted && !res.writableEnded) {
        abortController.abort();
      }
    });

    await streamAgentResponse(
      res,
      agent,
      modelMessages,
      messages,
      assistantContext,
      assistantExtensionsContext,
      modelConfig,
      blockishOverviewContext,
      abortController.signal
    );

    streamCompleted = true;
    return res.end();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run assistant";

    console.error("Assistant request failed:", error);

    if (res.destroyed || res.closed) {
      return;
    }

    if (res.headersSent) {
      writeSse(res, "error", { error: message });
      return res.end();
    }

    return sendErrorResponse(res, 500, message);
  }
}
