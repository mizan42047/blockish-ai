import type { Request, Response } from "express";
import { createDeepAgent, type SubAgent } from "deepagents";
import { getBlockishOverviewContext } from "agent/context/document-context.js";
import { createProductManagerAgent } from "agent/main-agent.js";
import { createDesignerSubAgent } from "agent/subagents/designer-agent.js";
import { createDeveloperSubAgent } from "agent/subagents/developer-agent.js";
import {
  validateGeneratedResponse,
  type BlockishGeneratedResponse,
  type BlockishSchemaBlock,
} from "agent/schema.js";
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

function createAgentPlan(
  messages: AssistantMessage[],
  context: AssistantContext | null
): string[] {
  const userMessages = messages.filter((m) => m.role === "user");
  const isFirstMessage = userMessages.length <= 1;
  const hasBlocks = (context?.blocks?.length ?? 0) > 0;

  if (isFirstMessage) {
    return [
      "Understanding your design request",
      hasBlocks ? "Reviewing selected block context" : "Reviewing full page context",
      "Identifying any missing brief details",
      "Preparing a focused response",
    ];
  }

  return [
    "Reading your follow-up",
    "Reviewing the conversation so far",
    hasBlocks ? "Checking selected block context" : "Checking page context",
    "Deciding the next step",
  ];
}

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

function getResponseReasoning(
  messages: AssistantMessage[],
  context: AssistantContext | null,
  message: unknown
) {
  const steps: string[] = [];
  const text = getStringContent(message);
  const lowerText = text.toLowerCase();
  const blockCount = context?.blocks?.length ?? 0;

  const lastUserMsg = messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
  if (lastUserMsg) {
    const truncated = lastUserMsg.length > 60
      ? `${lastUserMsg.slice(0, 60).trim()}…`
      : lastUserMsg;
    steps.push(`Read: "${truncated}"`);
  }

  if (context?.scope === "full_page") {
    steps.push("Checked full page context");
  } else if (blockCount) {
    steps.push(`Checked ${blockCount} selected block${blockCount === 1 ? "" : "s"}`);
  } else {
    steps.push("Checked full page context");
  }

  if (lowerText.includes("## designer guide")) {
    steps.push("Determined all required brief details are available");
    steps.push("Delegated brief to designer agent");
    steps.push("Received designer guide");
    return steps;
  }

  if (lowerText.includes("page brief") || lowerText.includes("design scope")) {
    steps.push("Determined all required brief details are available");
    steps.push("Produced the product brief");
    return steps;
  }

  const questionMatch = text.match(/\*\*Question:\*\*\s*(.+?)(?:\n|$)/);
  if (questionMatch?.[1]) {
    const q = questionMatch[1].trim();
    const truncated = q.length > 70 ? `${q.slice(0, 70).trim()}…` : q;
    steps.push("Found highest-priority missing detail");
    steps.push(`Asked: "${truncated}"`);
    return steps;
  }

  steps.push("Prepared a response to your message");
  return steps;
}

const CUSTOM_OPTION_PATTERN = /^(something else|other|custom)$/i;
const namedSectionPattern =
  /\b(hero|faq|about|pricing|features?|testimonials?|reviews?|team|contact|cta|stats?|counter|portfolio)\b/i;
const pageRequestPattern = /\b(full page|landing page|homepage|home page|website|page)\b/i;
const ctaPattern =
  /\b(download|install|book|trial|demo|join|sign ?up|subscribe|contact|buy|purchase|get started|learn more|view plans)\b/i;

type DirectBuildBrief = {
  cta: string;
  goal: string;
  scope: string;
  subject: string;
  targetAudience: string;
  text: string;
};

function parseInteractionFromMessage(message: string): {
  cleanedMessage: string;
  interaction: AssistantInteraction | undefined;
} {
  const optionsMatch = message.match(/\*\*Options:\*\*\s*(.+?)(?:\n|$)/i);

  if (!optionsMatch?.[1]) {
    return { cleanedMessage: message, interaction: undefined };
  }

  const rawOptions = optionsMatch[1]
    .split("|")
    .map((o) => o.trim())
    .filter(Boolean);

  if (!rawOptions.length) {
    return { cleanedMessage: message, interaction: undefined };
  }

  const hasCustom = rawOptions.some((o) => CUSTOM_OPTION_PATTERN.test(o));
  const pureOptions = rawOptions.filter((o) => !CUSTOM_OPTION_PATTERN.test(o));

  const isYesNo =
    pureOptions.length === 2 &&
    pureOptions.some((o) => /^yes$/i.test(o)) &&
    pureOptions.some((o) => /^no$/i.test(o));

  const interactionOptions: AssistantInteractionOption[] = pureOptions.map((opt) => ({
    label: opt,
    value: opt,
  }));

  const interaction: AssistantInteraction = {
    id: `q-${Date.now()}`,
    type: isYesNo ? "yes_no" : "single_choice",
    options: interactionOptions,
    allowCustom: hasCustom,
    required: true,
  };

  const cleanedMessage = message
    .replace(optionsMatch[0], "")
    .replace(/\n{2,}/g, "\n\n")
    .trim();

  return { cleanedMessage, interaction };
}

function createInteractionOptions(options: string[]): AssistantInteractionOption[] {
  return options.map((option) => ({
    label: option,
    value: option,
  }));
}

function createSingleChoiceInteraction(
  options: string[],
  allowCustom = true
): AssistantInteraction {
  return {
    id: `q-${Date.now()}`,
    type: "single_choice",
    options: createInteractionOptions(options),
    allowCustom,
    required: true,
  };
}

function inferInteractionFromMessage(
  message: string,
  messages: AssistantMessage[]
): AssistantInteraction | undefined {
  const lowerMessage = message.toLowerCase();
  const allText = messages.map((item) => item.content).join("\n").toLowerCase();

  if (!lowerMessage.includes("question:") && !message.trim().endsWith("?")) {
    return undefined;
  }

  if (/\b(yes|no)\b/i.test(message) && /\?/.test(message)) {
    return {
      id: `q-${Date.now()}`,
      type: "yes_no",
      options: createInteractionOptions(["Yes", "No"]),
      required: true,
    };
  }

  if (lowerMessage.includes("type of gym") || lowerMessage.includes("kind of gym")) {
    return createSingleChoiceInteraction([
      "General fitness",
      "CrossFit",
      "Yoga",
      "Boutique",
      "Something else",
    ]);
  }

  if (
    lowerMessage.includes("primary goal") ||
    lowerMessage.includes("main button") ||
    lowerMessage.includes("call to action") ||
    lowerMessage.includes("action should visitors")
  ) {
    if (allText.includes("gym") || allText.includes("fitness")) {
      return createSingleChoiceInteraction([
        "Book a trial",
        "Join now",
        "View plans",
        "Build awareness",
        "Something else",
      ]);
    }

    if (allText.includes("plugin") || allText.includes("wordpress")) {
      return createSingleChoiceInteraction([
        "Download now",
        "See features",
        "View demo",
        "Get started",
        "Something else",
      ]);
    }

    return createSingleChoiceInteraction([
      "Get started",
      "Book a demo",
      "Contact us",
      "Learn more",
      "Something else",
    ]);
  }

  if (lowerMessage.includes("target audience") || lowerMessage.includes("who is this for")) {
    return createSingleChoiceInteraction([
      "Beginners",
      "Professionals",
      "Local customers",
      "Everyone",
      "Something else",
    ]);
  }

  return undefined;
}

function getUserMessageContents(messages: AssistantMessage[]): string[] {
  return messages
    .filter((message) => message.role === "user")
    .map((message) => message.content.trim())
    .filter(Boolean);
}

function getCombinedUserText(messages: AssistantMessage[]): string {
  return getUserMessageContents(messages).join("\n");
}

function getMatchedText(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function detectScope(text: string): string {
  const sectionMatch = text.match(namedSectionPattern);

  if (sectionMatch?.[1]) {
    return `${sectionMatch[1].toLowerCase()} section`;
  }

  if (/\b(landing page|homepage|home page|full page|website|page)\b/i.test(text)) {
    return "full page";
  }

  return "design";
}

function detectSubject(text: string): string {
  const subject = getMatchedText(text, [
    /\bfor (?:a |an |the )?(.+?)(?: website| site| landing page| homepage| home page| page| section|$)/i,
    /\bproduct[,:\s]+(.+?)(?:\.|$)/i,
    /\bbusiness[,:\s]+(.+?)(?:\.|$)/i,
  ]);

  if (subject) {
    return subject;
  }

  if (/\bgym|fitness|workout|training\b/i.test(text)) {
    return "general fitness gym";
  }

  if (/\bblockish|wordpress|gutenberg|plugin\b/i.test(text)) {
    return "Blockish WordPress Gutenberg plugin";
  }

  return "the business";
}

function detectCta(text: string, subject: string): string {
  const lowerText = text.toLowerCase();
  const lowerSubject = subject.toLowerCase();

  if (lowerText.includes("download") || lowerText.includes("install")) {
    return "Download now";
  }

  if (lowerText.includes("book") || lowerText.includes("trial")) {
    return lowerSubject.includes("gym") || lowerText.includes("class")
      ? "Book a trial class"
      : "Book a demo";
  }

  if (lowerText.includes("join") || lowerText.includes("sign up") || lowerText.includes("signup")) {
    return "Join now";
  }

  if (lowerText.includes("contact")) {
    return "Contact us";
  }

  if (lowerText.includes("view plans")) {
    return "View plans";
  }

  if (lowerSubject.includes("gym") || lowerSubject.includes("fitness")) {
    return "Book a trial class";
  }

  if (lowerSubject.includes("plugin") || lowerSubject.includes("wordpress")) {
    return "Download now";
  }

  return "Get started";
}

function detectAudience(text: string, subject: string): string {
  const lowerText = text.toLowerCase();
  const lowerSubject = subject.toLowerCase();

  if (lowerSubject.includes("gym") || lowerSubject.includes("fitness")) {
    if (lowerText.includes("general fitness")) {
      return "local people who want accessible general fitness training";
    }

    return "people looking for a gym that matches their fitness goals";
  }

  if (lowerSubject.includes("plugin") || lowerSubject.includes("wordpress")) {
    return "WordPress users, site builders, and Gutenberg users";
  }

  return "prospective customers evaluating the offer";
}

function detectGoal(scope: string, cta: string, subject: string): string {
  if (cta.toLowerCase().includes("download")) {
    return `drive ${subject} downloads`;
  }

  if (cta.toLowerCase().includes("book")) {
    return "convert visitors into bookings";
  }

  if (scope.includes("hero")) {
    return "capture attention and move visitors toward the primary CTA";
  }

  return "communicate value and encourage the next action";
}

function shouldBuildDirectly(messages: AssistantMessage[]): boolean {
  const userMessages = getUserMessageContents(messages);
  const text = userMessages.join("\n");
  const hasNamedSection = namedSectionPattern.test(text);
  const hasPageRequest = pageRequestPattern.test(text);

  if (!hasNamedSection && !hasPageRequest) {
    return false;
  }

  if (hasNamedSection && (userMessages.length >= 2 || ctaPattern.test(text))) {
    return true;
  }

  return hasPageRequest && (userMessages.length >= 3 || ctaPattern.test(text));
}

function createDirectBuildBrief(
  messages: AssistantMessage[]
): DirectBuildBrief | null {
  if (!shouldBuildDirectly(messages)) {
    return null;
  }

  const text = getCombinedUserText(messages);
  const scope = detectScope(text);
  const subject = detectSubject(text);
  const cta = detectCta(text, subject);
  const targetAudience = detectAudience(text, subject);
  const goal = detectGoal(scope, cta, subject);
  const brief = [
    "Product Manager brief:",
    "",
    `Design scope: ${scope}.`,
    `Subject/business: ${subject}.`,
    `Primary goal: ${goal}.`,
    `Primary CTA: ${cta}.`,
    `Target audience: ${targetAudience}.`,
    "User intent: quickly understand the offer, trust it, and take the next step.",
    "Brand voice: clear, confident, modern, and helpful.",
    "Visual direction: polished, conversion-focused, responsive, and built with Blockish blocks.",
    "Constraints: generate buildable Blockish/Gutenberg schema; use current Blockish blocks; prefer Class Manager for reusable styling.",
    "",
    "Conversation evidence:",
    text,
    "",
    "Assumptions:",
    "- Missing tone, copy, exact colors, proof, and imagery should be inferred instead of asked.",
    "- Keep the composition concise when the user asked for one section.",
  ].join("\n");

  return {
    cta,
    goal,
    scope,
    subject,
    targetAudience,
    text: brief,
  };
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

  return {
    result,
    text: getAssistantTextMessageContent(result) ||
      getLastTextMessageContent(result) ||
      getStringContent(getLastMessageContent(result)),
  };
}

function createDeveloperPrompt(
  brief: DirectBuildBrief,
  designGuide: string,
  context: AssistantContext | null,
  extensions: AssistantExtensionsContext | null
) {
  return [
    brief.text,
    "",
    "Designer guide:",
    designGuide,
    "",
    "Previous editor context:",
    JSON.stringify(getSchemaPrev(context, extensions), null, 2),
    "",
    "Return the final BlockishGeneratedResponse JSON only.",
    "schema.new.blocks must not be empty.",
    "Use blockish/container, blockish/heading, blockish/button, and blockish/image when they fit.",
  ].join("\n");
}

function createContainerBlock(
  attributes: Record<string, unknown>,
  innerBlocks: BlockishSchemaBlock[] = []
): BlockishSchemaBlock {
  return {
    name: "blockish/container",
    attributes,
    innerBlocks,
  };
}

function createHeadingBlock(
  content: string,
  tag: string,
  attributes: Record<string, unknown> = {}
): BlockishSchemaBlock {
  return {
    name: "blockish/heading",
    attributes: {
      content,
      tag: {
        label: tag.toUpperCase(),
        value: tag.toLowerCase(),
      },
      ...attributes,
    },
    innerBlocks: [],
  };
}

function createButtonBlock(text: string): BlockishSchemaBlock {
  return {
    name: "blockish/button",
    attributes: {
      text,
      buttonPlacement: { Desktop: "center" },
    },
    innerBlocks: [],
  };
}

function createImageBlock(
  url: string,
  alt: string
): BlockishSchemaBlock {
  return {
    name: "blockish/image",
    attributes: {
      image: {
        url,
        alt,
        width: 800,
        height: 800,
      },
      alt,
      imageSize: { value: "full", label: "Full Size" },
      imageWidth: { Desktop: "100%" },
      imageHeight: { Desktop: "280px" },
      objectFit: { Desktop: "cover" },
    },
    innerBlocks: [],
  };
}

function createTeamMemberCard(
  name: string,
  role: string,
  imageUrl: string
): BlockishSchemaBlock {
  return createContainerBlock(
    {
      display: "flex",
      flexDirection: {
        Desktop: { label: "Column", value: "column" },
      },
      rowGap: { Desktop: "14px" },
      containerBorderRadius: {
        Desktop: {
          topLeft: "18px",
          topRight: "18px",
          bottomRight: "18px",
          bottomLeft: "18px",
        },
      },
    },
    [
      createImageBlock(imageUrl, `${name}, ${role}`),
      createHeadingBlock(name, "h3", {
        alignment: { Desktop: "center" },
      }),
      createHeadingBlock(role, "p", {
        alignment: { Desktop: "center" },
        color: "#666666",
      }),
    ]
  );
}

function createTeamFallbackBlocks(brief: DirectBuildBrief): BlockishSchemaBlock[] {
  return [
    createContainerBlock(
      {
        containerWidth: "alignfull",
        display: "flex",
        flexDirection: {
          Desktop: { label: "Column", value: "column" },
        },
        alignItems: {
          Desktop: { label: "Center", value: "center" },
        },
        rowGap: { Desktop: "36px", Mobile: "24px" },
      },
      [
        createContainerBlock(
          {
            display: "flex",
            flexDirection: {
              Desktop: { label: "Column", value: "column" },
            },
            alignItems: {
              Desktop: { label: "Center", value: "center" },
            },
            rowGap: { Desktop: "12px" },
          },
          [
            createHeadingBlock("Meet the team", "h2", {
              alignment: { Desktop: "center" },
            }),
            createHeadingBlock(
              `The people behind ${brief.subject}, focused on clarity, craft, and dependable results.`,
              "p",
              {
                alignment: { Desktop: "center" },
                color: "#555555",
              }
            ),
          ]
        ),
        createContainerBlock(
          {
            display: "grid",
            gridLayoutType: "fixed",
            gridColumns: {
              Desktop: 3,
              Tablet: 2,
              Mobile: 1,
            },
            columnGap: { Desktop: "24px" },
            rowGap: { Desktop: "24px" },
          },
          [
            createTeamMemberCard(
              "Alex Morgan",
              "Product Lead",
              "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=80"
            ),
            createTeamMemberCard(
              "Maya Chen",
              "Design Lead",
              "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=80"
            ),
            createTeamMemberCard(
              "Jordan Lee",
              "Customer Success",
              "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=900&q=80"
            ),
          ]
        ),
      ]
    ),
  ];
}

function createHeroFallbackBlocks(brief: DirectBuildBrief): BlockishSchemaBlock[] {
  const isGym = brief.subject.toLowerCase().includes("gym");
  const title = isGym
    ? "Train stronger, feel better"
    : `Build faster with ${brief.subject}`;
  const subtitle = isGym
    ? "A modern fitness experience designed for real progress, flexible schedules, and confident first steps."
    : "Create polished Gutenberg layouts faster with a focused Blockish design system.";
  const imageUrl = isGym
    ? "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1200&q=80"
    : "https://images.unsplash.com/photo-1498050108023-c5249f4df0852?auto=format&fit=crop&w=1200&q=80";

  return [
    createContainerBlock(
      {
        containerWidth: "alignfull",
        display: "flex",
        flexDirection: {
          Desktop: { label: "Row", value: "row" },
          Mobile: { label: "Column", value: "column" },
        },
        justifyContent: {
          Desktop: { label: "Center", value: "center" },
        },
        alignItems: {
          Desktop: { label: "Center", value: "center" },
        },
        columnGap: { Desktop: "48px" },
        rowGap: { Mobile: "28px" },
        containerMinHeight: { Desktop: "620px", Mobile: "520px" },
      },
      [
        createContainerBlock(
          {
            display: "flex",
            flexDirection: {
              Desktop: { label: "Column", value: "column" },
            },
            alignItems: {
              Desktop: { label: "Flex Start", value: "flex-start" },
            },
            rowGap: { Desktop: "20px" },
          },
          [
            createHeadingBlock(title, "h1"),
            createHeadingBlock(subtitle, "p"),
            createButtonBlock(brief.cta),
          ]
        ),
        createImageBlock(imageUrl, `${brief.subject} visual`),
      ]
    ),
  ];
}

function createFallbackSchema(
  brief: DirectBuildBrief,
  context: AssistantContext | null
): BlockishGeneratedResponse {
  const isFullPage = context?.scope === "full_page";
  const blocks = brief.scope.includes("team")
    ? createTeamFallbackBlocks(brief)
    : createHeroFallbackBlocks(brief);

  return {
    message: `I built a ${brief.scope} draft with buildable Blockish blocks.`,
    summary: `${brief.scope} schema generated.`,
    schema: {
      new: {
        scope: isFullPage ? "full_page" : "selection",
        mode: "blocks",
        extensions: {},
        blocks,
      },
    },
  };
}

async function runDirectBuildFlow(
  brief: DirectBuildBrief,
  modelConfig: CreateModelConfig,
  blockishOverviewContext: string,
  context: AssistantContext | null,
  extensions: AssistantExtensionsContext | null,
  signal: AbortSignal
): Promise<BlockishGeneratedResponse> {
  try {
    const designer = createRunnableSubAgent(
      createDesignerSubAgent({
        blockishOverviewContext,
        modelConfig,
      })
    );
    const designerResult = await runAgentForText(
      designer,
      brief.text,
      signal
    );
    const developer = createRunnableSubAgent(
      createDeveloperSubAgent({
        blockishOverviewContext,
        modelConfig,
      })
    );
    const developerResult = await runAgentForText(
      developer,
      createDeveloperPrompt(brief, designerResult.text, context, extensions),
      signal
    );
    const developerSchema = findDeveloperSchemaFromResult(developerResult.result);

    return developerSchema ?? createFallbackSchema(brief, context);
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }

    console.error("Direct build flow failed, using fallback schema:", error);
    return createFallbackSchema(brief, context);
  }
}

function findDeveloperSchemaFromResult(result: unknown): BlockishGeneratedResponse | null {
  const messages = getResultMessages(result);

  for (let i = messages.length - 1; i >= 0; i--) {
    const content = messages[i]?.content;

    const candidates: string[] = [];

    if (typeof content === "string") {
      candidates.push(content);
    } else if (Array.isArray(content)) {
      for (const item of content) {
        if (!item || typeof item !== "object") continue;
        const obj = item as Record<string, unknown>;
        const text = obj.text ?? obj.content ?? obj.output ?? obj.result;
        if (typeof text === "string") candidates.push(text);
        else if (text !== undefined) candidates.push(JSON.stringify(text));
      }
    }

    for (const text of candidates) {
      if (!text.trim()) continue;
      const parsed = extractJsonFromText(text);
      if (!parsed) continue;
      const sanitized = sanitizeDeveloperSchema(parsed);
      const validated = validateGeneratedResponse(sanitized);
      if (validated.value) return validated.value;
    }
  }

  return null;
}

function extractJsonFromText(text: string): unknown {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {}

  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]+?)\n?```/);
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {}
  }

  const objMatch = trimmed.match(/\{[\s\S]+\}/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]);
    } catch {}
  }

  return null;
}

function sanitizeDeveloperSchema(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const obj = value as Record<string, unknown>;
  const schema = obj.schema as Record<string, unknown> | undefined;
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return value;
  }

  const schemaNew = schema.new as Record<string, unknown> | undefined;
  if (!schemaNew || typeof schemaNew !== "object" || Array.isArray(schemaNew)) {
    return value;
  }

  if (!schemaNew.scope || (schemaNew.scope !== "full_page" && schemaNew.scope !== "selection")) {
    const raw = String(schemaNew.scope ?? "").toLowerCase();
    schemaNew.scope = raw.includes("full") || raw.includes("page") ? "full_page" : "selection";
  }

  if (typeof schemaNew.mode !== "string" || !schemaNew.mode) {
    schemaNew.mode = "blocks";
  }

  if (!schemaNew.extensions || typeof schemaNew.extensions !== "object" || Array.isArray(schemaNew.extensions)) {
    schemaNew.extensions = {};
  }

  if (!Array.isArray(schemaNew.blocks)) {
    schemaNew.blocks = [];
  }

  if (typeof obj.message !== "string" || !obj.message.trim()) {
    obj.message = "Schema generated.";
  }

  if (typeof obj.summary !== "string" || !obj.summary.trim()) {
    obj.summary = "Schema ready.";
  }

  return value;
}

function createChatCompatibleResponse(
  result: unknown,
  messages: AssistantMessage[],
  context: AssistantContext | null,
  extensions: AssistantExtensionsContext | null,
  developerSchema: BlockishGeneratedResponse | null,
  streamedMessage?: string
): ChatCompatibleResponse {
  const rawMessage =
    developerSchema?.message ||
    getLastTextMessageContent(result) ||
    streamedMessage?.trim() ||
    "I started the next agent step, but I do not have a final response yet. Please try again.";

  const parsedInteraction = parseInteractionFromMessage(rawMessage);
  const cleanedMessage = parsedInteraction.cleanedMessage;
  const interaction = parsedInteraction.interaction ??
    inferInteractionFromMessage(cleanedMessage, messages);

  return {
    message: cleanedMessage,
    reasoning: getResponseReasoning(messages, context, cleanedMessage),
    summary: developerSchema?.summary ?? getResponseSummary(messages, context, cleanedMessage),
    schema: {
      prev: getSchemaPrev(context, extensions),
      new: developerSchema?.schema.new ?? null,
    },
    interaction,
  };
}

function writeSse(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function logGeneratedSchema(
  source: string,
  schema: BlockishGeneratedResponse["schema"]["new"] | null | undefined
) {
  if (!schema) {
    console.log(`[assistant:schema:${source}] No schema generated.`);
    return;
  }

  console.log(
    `[assistant:schema:${source}]`,
    JSON.stringify(schema, null, 2)
  );
}

async function streamAgentResponse(
  res: Response,
  agent: ReturnType<typeof createProductManagerAgent>,
  modelMessages: AssistantModelMessage[],
  summaryMessages: AssistantMessage[],
  context: AssistantContext | null,
  extensions: AssistantExtensionsContext | null,
  signal: AbortSignal
) {
  const planSteps = createAgentPlan(summaryMessages, context);
  writeSse(res, "plan", { steps: planSteps });

  let streamedMessage = "";
  const run = await agent.streamEvents(
    { messages: modelMessages },
    { version: "v3", signal }
  );

  for await (const message of run.messages) {
    for await (const token of message.text) {
      streamedMessage += token;
      writeSse(res, "delta", { delta: token });
    }
  }

  const result = await run.output;
  const developerSchema = findDeveloperSchemaFromResult(result);

  if (developerSchema) {
    logGeneratedSchema("agent", developerSchema.schema.new);
    writeSse(res, "status", { step: "Schema generated successfully" });
  }

  const responseData = createChatCompatibleResponse(
    result,
    summaryMessages,
    context,
    extensions,
    developerSchema,
    streamedMessage || getStringContent(getLastMessageContent(result))
  );

  writeSse(res, "final", { response: { ok: true, data: responseData } });
  writeSse(res, "done", "[DONE]");
}

async function streamDirectBuildResponse(
  res: Response,
  brief: DirectBuildBrief,
  modelConfig: CreateModelConfig,
  blockishOverviewContext: string,
  messages: AssistantMessage[],
  context: AssistantContext | null,
  extensions: AssistantExtensionsContext | null,
  signal: AbortSignal
) {
  writeSse(res, "plan", {
    steps: [
      "Preparing product brief",
      "Creating design guide",
      "Generating Blockish schema",
      "Applying validation",
    ],
  });
  writeSse(res, "status", { step: "Product brief ready" });

  const developerSchema = await runDirectBuildFlow(
    brief,
    modelConfig,
    blockishOverviewContext,
    context,
    extensions,
    signal
  );

  logGeneratedSchema("direct", developerSchema.schema.new);
  writeSse(res, "status", { step: "Schema generated successfully" });
  writeSse(res, "final", {
    response: {
      ok: true,
      data: {
        message: developerSchema.message,
        reasoning: [
          "Used the conversation to prepare the brief",
          "Generated a designer guide",
          "Generated Blockish schema",
        ],
        summary: developerSchema.summary,
        schema: {
          prev: getSchemaPrev(context, extensions),
          new: developerSchema.schema.new,
        },
      } satisfies ChatCompatibleResponse,
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
    const directBrief = createDirectBuildBrief(messages);

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

    if (directBrief) {
      await streamDirectBuildResponse(
        res,
        directBrief,
        modelConfig,
        blockishOverviewContext,
        messages,
        assistantContext,
        assistantExtensionsContext,
        abortController.signal
      );
    } else {
      await streamAgentResponse(
        res,
        agent,
        modelMessages,
        messages,
        assistantContext,
        assistantExtensionsContext,
        abortController.signal
      );
    }

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
