import type {
  AssistantInteraction,
  AssistantInteractionOption,
  AssistantMessage,
} from "./assistant.types.js";

const CUSTOM_OPTION_PATTERN = /^(something else|other|custom)$/i;

export function parseInteractionFromMessage(message: string): {
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

export function inferInteractionFromMessage(
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
    lowerMessage.includes("main goal") ||
    lowerMessage.includes("primary goal") ||
    lowerMessage.includes("goal of this") ||
    lowerMessage.includes("main button") ||
    lowerMessage.includes("call to action") ||
    lowerMessage.includes("action should visitors")
  ) {
    if (allText.includes("hero") || lowerMessage.includes("hero section")) {
      return createSingleChoiceInteraction([
        "Showcase a product",
        "Promote an offer",
        "Capture leads",
        "Build trust",
        "Something else",
      ]);
    }

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
