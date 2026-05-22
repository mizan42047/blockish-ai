import { createAssistantModelConfig } from "agent/callbacks/assistant-model-config.js";
import type {
  AssistantRunEvents,
  AssistantToolEvent,
} from "agent/callbacks/assistant.types.js";
import { createDesignerTool } from "agent/subagents/designer-agent.js";
import { createDeveloperTool } from "agent/subagents/developer-agent.js";
import { runWithAssistantToolEvents } from "agent/utility/tool-event-middleware.js";
import { isNonEmptyString } from "utils.js";

type DebugRequestInput = {
  assets?: unknown;
  brief?: unknown;
  context?: unknown;
  designBrief?: unknown;
  prompt?: unknown;
};

type DeveloperDebugCase = {
  assets: unknown;
  brief: string;
  context: string;
  designBrief: string;
};

type DebugToolResult = {
  input: unknown;
  parsedOutput: unknown;
  rawOutput: unknown;
  tool: "designer" | "developer";
};

const designerPrompts = [
  "Create a creative team section for a modern gym website. It should show trainers, specialties, energetic visuals, and a clear CTA to book a trial session.",
  "Create a hero section for the Blockish WordPress Gutenberg plugin. Focus on 14 blocks, 2 extensions, fast page building, and a Download Now CTA.",
  "Create an FAQ section for a SaaS product landing page. It should feel polished, compact, and trustworthy with clear interaction states.",
  "Create a pricing section for a WordPress plugin. Include three tiers, strong visual hierarchy, and clear upgrade CTAs.",
  "Create a feature showcase section for a Gutenberg block plugin. Make it visual, modern, and reusable with Class Manager direction.",
];

const developerCases: DeveloperDebugCase[] = [
  {
    assets: {
      icons: [],
      images: [
        {
          placement: "Team member cards",
          purpose: "Trainer portrait placeholders that should be replaced with real media in production.",
          title: "Fitness trainer portrait",
          url: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b",
        },
      ],
      videos: [],
    },
    brief: "Build a team section for a gym website. Scope: one section. Goal: introduce trainers and encourage users to book a trial session. Audience: busy adults looking for expert fitness coaching. CTA: Book a trial session.",
    context: "Debug direct developer run. Generate schema.new.blocks and schema.new.extensions.classManager.create. Do not return only chat text.",
    designBrief: [
      "Design a premium trainer team section with a compact intro, three trainer cards, portrait image area, role/specialty text, short bio, and a CTA.",
      "Use Class Manager for section, heading, text, card, image, and button styles.",
      "Use Container blocks for layout/card wrappers, Heading blocks for text, Image blocks for portraits, and Button blocks for CTA.",
    ].join("\n"),
  },
  {
    assets: {
      icons: [],
      images: [],
      videos: [],
    },
    brief: "Build an FAQ section for a WordPress plugin landing page. Scope: one section. Goal: answer common install, compatibility, pricing, and support questions. Audience: WordPress site owners. CTA: Download Now.",
    context: "Debug direct developer run. Generate an FAQ layout, not a hero layout.",
    designBrief: [
      "Create a clean FAQ section using Accordion where possible.",
      "Include a title, intro copy, and four useful questions.",
      "Use Class Manager for reusable wrapper, accordion/card, heading, and text styles.",
    ].join("\n"),
  },
  {
    assets: {
      icons: [],
      images: [
        {
          placement: "Hero media",
          purpose: "Visual preview area for the plugin/page builder experience.",
          title: "Clean software workspace",
          url: "https://images.unsplash.com/photo-1497366754035-f200968a6e72",
        },
      ],
      videos: [],
    },
    brief: "Build a hero section for the Blockish WordPress Gutenberg plugin. Scope: one section. Goal: drive plugin downloads. Audience: WordPress site owners and Gutenberg users. CTA: Download Now.",
    context: "Debug direct developer run. Make sure Container blocks set isVariationPicked true.",
    designBrief: [
      "Create a modern split hero with headline, supporting copy, CTA, trust detail, and visual media.",
      "Use Class Manager heavily instead of repeated inline styles.",
      "Use real image URLs from assets only when appropriate; avoid broken placeholders.",
    ].join("\n"),
  },
];

function getString(value: unknown): string | undefined {
  return isNonEmptyString(value) ? value.trim() : undefined;
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)] ?? items[0]!;
}

function parseJsonString(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getRawToolOutput(value: unknown): unknown {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "content" in value
  ) {
    return (value as { content?: unknown }).content;
  }

  return value;
}

function getParsedToolOutput(value: unknown): unknown {
  const rawOutput = getRawToolOutput(value);

  return typeof rawOutput === "string"
    ? parseJsonString(rawOutput)
    : rawOutput;
}

function createDesignBriefForPrompt(prompt: string): string {
  const lowerPrompt = prompt.toLowerCase();

  if (lowerPrompt.includes("team")) {
    return [
      "Create a polished team section that matches the requested business.",
      "Include an intro, member cards, portraits/media, role or specialty text, short bios, and a CTA when appropriate.",
      "Use Class Manager for reusable section, card, image, heading, text, and button styling.",
    ].join("\n");
  }

  if (lowerPrompt.includes("faq") || lowerPrompt.includes("question")) {
    return [
      "Create a clean FAQ section with a title, short intro, and useful question/answer items.",
      "Use Accordion where possible and keep the layout compact, readable, and responsive.",
      "Use Class Manager for reusable section, accordion/card, heading, and text styling.",
    ].join("\n");
  }

  if (lowerPrompt.includes("pricing")) {
    return [
      "Create a strong pricing section with tier cards, clear feature hierarchy, highlighted recommended plan, and CTAs.",
      "Keep the layout responsive and easy to compare.",
      "Use Class Manager for reusable section, pricing card, heading, text, badge, and button styling.",
    ].join("\n");
  }

  if (lowerPrompt.includes("hero")) {
    return [
      "Create a high-impact hero section with headline, supporting copy, CTA, trust detail, and visual/media area.",
      "Match the requested product or business instead of falling back to a generic layout.",
      "Use Class Manager for reusable section, text, button, and image/media styling.",
    ].join("\n");
  }

  return [
    "Create an implementation-ready Blockish design for the requested scope.",
    "Use a clear content hierarchy, responsive layout, useful visual structure, and reusable Class Manager styles.",
    "Choose existing Blockish blocks that match the request without changing the requested scope.",
  ].join("\n");
}

function createDebugEvents(label: string): AssistantRunEvents {
  const startedAt = Date.now();

  function logToolEvent(phase: "start" | "end", event: AssistantToolEvent) {
    console.log(`[Blockish AI][debug:${label}:tool_${phase}]`, {
      ...event,
      elapsedMs: Date.now() - startedAt,
    });
  }

  return {
    onStatus: (message) => {
      console.log(`[Blockish AI][debug:${label}:status]`, {
        elapsedMs: Date.now() - startedAt,
        message,
      });
    },
    onToolEnd: (event) => logToolEvent("end", event),
    onToolStart: (event) => logToolEvent("start", event),
  };
}

export async function runDesignerDebug(
  input: DebugRequestInput = {}
): Promise<DebugToolResult> {
  const modelConfig = createAssistantModelConfig();
  const designerTool = createDesignerTool({ modelConfig });
  const toolInput = {
    brief: getString(input.brief) ?? getString(input.prompt) ?? pickRandom(designerPrompts),
    context: getString(input.context) ?? "Direct designer debug run.",
  };

  console.log("[Blockish AI][debug:designer:start]", { input: toolInput });

  const rawOutput = await runWithAssistantToolEvents(
    createDebugEvents("designer"),
    () => designerTool.invoke(toolInput)
  );

  console.log("[Blockish AI][debug:designer:end]", {
    parsedOutput: getParsedToolOutput(rawOutput),
    rawOutput: getRawToolOutput(rawOutput),
  });

  return {
    input: toolInput,
    parsedOutput: getParsedToolOutput(rawOutput),
    rawOutput: getRawToolOutput(rawOutput),
    tool: "designer",
  };
}

export async function runDeveloperDebug(
  input: DebugRequestInput = {}
): Promise<DebugToolResult> {
  const modelConfig = createAssistantModelConfig();
  const developerTool = createDeveloperTool({ modelConfig });
  const fallbackCase = pickRandom(developerCases);
  const customPrompt = getString(input.brief) ?? getString(input.prompt);
  const brief = customPrompt ?? fallbackCase.brief;
  const toolInput = {
    assets: input.assets ?? (customPrompt ? { icons: [], images: [], videos: [] } : fallbackCase.assets),
    brief,
    context: getString(input.context) ?? (
      customPrompt
        ? "Debug direct developer run. Generate schema.new.blocks and schema.new.extensions.classManager.create. Do not return only chat text."
        : fallbackCase.context
    ),
    designBrief: getString(input.designBrief) ?? (
      customPrompt ? createDesignBriefForPrompt(brief) : fallbackCase.designBrief
    ),
  };

  console.log("[Blockish AI][debug:developer:start]", { input: toolInput });

  const rawOutput = await runWithAssistantToolEvents(
    createDebugEvents("developer"),
    () => developerTool.invoke(toolInput)
  );

  console.log("[Blockish AI][debug:developer:end]", {
    parsedOutput: getParsedToolOutput(rawOutput),
    rawOutput: getRawToolOutput(rawOutput),
  });

  return {
    input: toolInput,
    parsedOutput: getParsedToolOutput(rawOutput),
    rawOutput: getRawToolOutput(rawOutput),
    tool: "developer",
  };
}
