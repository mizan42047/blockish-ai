import type { Request, Response } from "express";
import { createDeepAgent, type SubAgent } from "deepagents";
import { getBlockishOverviewContext } from "agent/context/document-context.js";
import { createProductManagerAgent } from "agent/main-agent.js";
import { createDeveloperSubAgent } from "agent/subagents/developer-agent.js";
import { createDesignerSubAgent } from "agent/subagents/designer-agent.js";
import type { CreateModelConfig } from "agent/utility/create-model.js";
import {
  generatedResponseContractName,
  validateGeneratedResponse,
  type BlockishGeneratedResponse,
} from "agent/schema.js";
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

type DelegatedSchemaResult = {
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

function getResultMessages(result: unknown) {
  const messages = (result as { messages?: Array<{ content?: unknown }> }).messages;

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
  const text = getStringContent(message).toLowerCase();

  if (!text.includes("**question:**") && !text.includes("question:")) {
    return undefined;
  }

  if (text.includes("page type") || text.includes("type of page")) {
    return createSingleChoiceInteraction("page_type", "Choose page type", [
      { label: "Landing page", value: "landing_page" },
      { label: "Product page", value: "product_page" },
      { label: "Homepage", value: "homepage" },
      { label: "About page", value: "about_page" },
      { label: "Blog post", value: "blog_post" },
    ]);
  }

  if (text.includes("primary goal") || text.includes("main objective")) {
    return createSingleChoiceInteraction("primary_goal", "Choose primary goal", [
      { label: "Generate leads", value: "generate_leads" },
      { label: "Get signups", value: "get_signups" },
      { label: "Sell a product", value: "sell_product" },
      { label: "Showcase features", value: "showcase_features" },
      { label: "Explain the offer", value: "explain_offer" },
    ]);
  }

  if (text.includes("target audience") || text.includes("who is this for")) {
    return createSingleChoiceInteraction("target_audience", "Choose audience", [
      { label: "Website owners", value: "website_owners" },
      { label: "Developers", value: "developers" },
      { label: "Agencies", value: "agencies" },
      { label: "Small businesses", value: "small_businesses" },
      { label: "Creators", value: "creators" },
    ]);
  }

  if (text.includes("primary cta") || text.includes("call to action")) {
    return createSingleChoiceInteraction("primary_cta", "Choose CTA", [
      { label: "Download now", value: "download_now" },
      { label: "Get started", value: "get_started" },
      { label: "Book a demo", value: "book_demo" },
      { label: "Contact us", value: "contact_us" },
      { label: "Learn more", value: "learn_more" },
    ]);
  }

  if (text.includes("section") && text.includes("include")) {
    return {
      id: "sections",
      type: "multi_choice",
      label: "Choose sections",
      options: [
        { label: "Hero", value: "hero" },
        { label: "Features", value: "features" },
        { label: "Benefits", value: "benefits" },
        { label: "Testimonials", value: "testimonials" },
        { label: "Pricing", value: "pricing" },
        { label: "FAQ", value: "faq" },
      ],
      allowCustom: true,
      required: true,
    };
  }

  if (
    text.includes("do you") ||
    text.includes("should we") ||
    text.includes("would you") ||
    text.includes("is this")
  ) {
    return {
      id: "confirmation",
      type: "yes_no",
      label: "Choose an answer",
      options: [
        { label: "Yes", value: "yes" },
        { label: "No", value: "no" },
      ],
      required: true,
    };
  }

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

  return getLastTextMessageContent(result) ||
    getStringContent(getLastMessageContent(result));
}

function parseJsonObject(value: string): unknown | null {
  const fencedJson = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const jsonText = fencedJson ?? value;
  const start = jsonText.indexOf("{");
  const end = jsonText.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(jsonText.slice(start, end + 1));
  } catch (error) {
    return null;
  }
}

function createDeveloperPrompt(
  brief: string,
  designGuide: string,
  context: AssistantContext | null,
  extensions: AssistantExtensionsContext | null
) {
  return [
    "Create the final Blockish/Gutenberg block schema for the frontend.",
    "Use the product brief and design guide below.",
    `Return JSON matching ${generatedResponseContractName}.`,
    "Put extension changes in schema.new.extensions and block changes in schema.new.blocks.",
    "Prefer Class Manager for reusable/global style after checking existing classes.",
    "Return only valid JSON. Do not wrap it in Markdown.",
    "",
    "Previous editor context:",
    JSON.stringify(getSchemaPrev(context, extensions), null, 2),
    "",
    "Existing Class Manager classes:",
    JSON.stringify(extensions?.classManager ?? [], null, 2),
    "",
    "Product brief:",
    brief,
    "",
    "Design guide:",
    designGuide,
  ].join("\n");
}

function createDeveloperRepairPrompt(
  invalidOutput: string,
  errors: string[]
) {
  return [
    `Repair this output so it matches ${generatedResponseContractName}.`,
    "Return only the corrected JSON object.",
    "Do not include Markdown fences or explanation.",
    "",
    "Validation errors:",
    ...errors.map((error) => `- ${error}`),
    "",
    "Invalid output:",
    invalidOutput,
  ].join("\n");
}

async function getValidatedDeveloperResponse(
  developer: ReturnType<typeof createDeepAgent>,
  prompt: string,
  signal: AbortSignal
): Promise<BlockishGeneratedResponse | null> {
  const firstOutput = await runAgentForText(developer, prompt, signal);
  const firstParsed = parseJsonObject(firstOutput);
  const firstValidation = validateGeneratedResponse(firstParsed);

  if (firstValidation.value) {
    return firstValidation.value;
  }

  const repairOutput = await runAgentForText(
    developer,
    createDeveloperRepairPrompt(firstOutput, firstValidation.errors),
    signal
  );
  const repairParsed = parseJsonObject(repairOutput);
  const repairValidation = validateGeneratedResponse(repairParsed);

  return repairValidation.value;
}

async function runDelegatedSchemaFlow(
  result: unknown,
  modelConfig: CreateModelConfig,
  blockishOverviewContext: string,
  context: AssistantContext | null,
  extensions: AssistantExtensionsContext | null,
  signal: AbortSignal
): Promise<DelegatedSchemaResult | null> {
  const taskCall = getTaskCallFromContent(getLastMessageContent(result));

  if (!taskCall || taskCall.subagentType !== "designer") {
    return null;
  }

  const designer = createRunnableSubAgent(
    createDesignerSubAgent({
      blockishOverviewContext,
      modelConfig,
    })
  );
  const designGuide = await runAgentForText(
    designer,
    taskCall.description,
    signal
  );

  if (!designGuide.trim()) {
    return null;
  }

  const developer = createRunnableSubAgent(
    createDeveloperSubAgent({
      blockishOverviewContext,
      modelConfig,
    })
  );
  const developerResponse = await getValidatedDeveloperResponse(
    developer,
    createDeveloperPrompt(taskCall.description, designGuide, context, extensions),
    signal
  );

  if (!developerResponse) {
    return {
      message: "I generated a design guide, but the schema output was invalid.",
      schemaNew: null,
      summary: "Developer schema validation failed.",
    };
  }

  return {
    message: developerResponse.message,
    schemaNew: developerResponse.schema.new,
    summary: developerResponse.summary,
  };
}

function createChatCompatibleResponse(
  result: unknown,
  messages: AssistantMessage[],
  context: AssistantContext | null,
  extensions: AssistantExtensionsContext | null,
  streamedMessage?: string,
  delegatedResult?: DelegatedSchemaResult | null
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
  const delegatedResult = await runDelegatedSchemaFlow(
    result,
    modelConfig,
    blockishOverviewContext,
    context,
    extensions,
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
    const { apiKey } = body;

    if (!isNonEmptyString(apiKey)) {
      return sendErrorResponse(res, 400, "apiKey is required");
    }

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
      apiKey,
      model: "openrouter/free",
      temperature: 0.5,
      siteName: "Blockish AI",
      siteUrl: "http://localhost",
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
