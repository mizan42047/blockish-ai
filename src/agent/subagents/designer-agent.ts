import { createAgent, tool } from "langchain";
import { z } from "zod";
import {
  createCollectIconAssetsTool,
  createCollectImageAssetsTool,
  createCollectVideoAssetsTool,
  createReadBlockishOverviewTool,
  createSearchDocsTool,
  createSuggestMissingBlockTool,
} from "agent/tools/index.js";
import {
  createModel,
  type CreateModelConfig,
} from "agent/utility/create-model.js";
import { extractAgentStructuredOutput } from "agent/utility/agent-output.js";
import { createToolEventMiddleware } from "agent/utility/tool-event-middleware.js";

export type CreateDesignerToolInput = {
  modelConfig: CreateModelConfig;
};

const designerToolSchema = z.object({
  brief: z
    .string()
    .describe("The product/design brief prepared by the Product Manager."),
  context: z
    .string()
    .optional()
    .describe("Optional extra context, such as conversation notes, editor context, or user constraints."),
});

const designerAssetSchema = z.object({
  credit: z
    .string()
    .optional()
    .describe("Asset credit or attribution when available."),
  format: z
    .string()
    .optional()
    .describe("Asset format, such as svg, image, or video."),
  placement: z
    .string()
    .describe("Where this asset should be used in the page or section."),
  purpose: z
    .string()
    .describe("Why this asset improves the design."),
  sourceUrl: z
    .string()
    .optional()
    .describe("Source or licensing page URL."),
  svg: z
    .string()
    .optional()
    .describe("Inline SVG markup for Blockish icon fields."),
  title: z
    .string()
    .describe("Short asset title."),
  url: z
    .string()
    .optional()
    .describe("Direct asset URL when available."),
});

const designerResponseSchema = z.object({
  brief: z
    .string()
    .describe("Markdown design brief with design intent, structure, visual style, Class Manager plan, responsive notes, and implementation notes."),
  assets: z.object({
    icons: z
      .array(designerAssetSchema)
      .describe("Selected SVG icon assets for the design."),
    images: z
      .array(designerAssetSchema)
      .describe("Selected image assets for the design."),
    videos: z
      .array(designerAssetSchema)
      .describe("Selected video assets for the design."),
  }),
});

type DesignerResponse = z.infer<typeof designerResponseSchema>;

function normalizeDesignerResponse(value: unknown): DesignerResponse | null {
  const parsed = designerResponseSchema.safeParse(value);

  return parsed.success ? parsed.data : null;
}

function createDesignerFallbackResponse(
  brief: string,
  context?: string
): DesignerResponse {
  const lowerBrief = brief.toLowerCase();
  const sectionType = lowerBrief.includes("team")
    ? "team"
    : lowerBrief.includes("faq") || lowerBrief.includes("question")
      ? "FAQ"
      : lowerBrief.includes("pricing")
        ? "pricing"
        : lowerBrief.includes("hero")
          ? "hero"
          : "content";
  const structure = sectionType === "team"
    ? [
      "Intro eyebrow or compact label.",
      "Strong heading focused on expertise and trust.",
      "Short supporting copy.",
      "Three trainer/member cards with portrait, name, role, specialty, and short bio.",
      "Primary CTA below the cards.",
    ]
    : sectionType === "FAQ"
      ? [
        "Section heading and short reassurance copy.",
        "Accordion list with four to six focused questions.",
        "Small CTA or helper link after the accordion.",
      ]
      : sectionType === "pricing"
        ? [
          "Section heading with value-focused intro.",
          "Three pricing cards with one highlighted plan.",
          "Feature bullets, price, and CTA per card.",
        ]
        : sectionType === "hero"
          ? [
            "Split hero with copy stack and media stack.",
            "Headline, subheadline, primary CTA, secondary proof detail.",
            "Visual preview area using image/video when available.",
          ]
          : [
            "Focused heading and supporting copy.",
            "Reusable content/card layout.",
            "Clear CTA or next action.",
          ];

  return {
    brief: [
      "## Design Intent",
      `Create a polished ${sectionType} section from the request: ${brief}`,
      context ? `Additional context: ${context}` : "",
      "",
      "## Structure",
      ...structure.map((item) => `- ${item}`),
      "",
      "## Visual Style",
      "- Modern, confident, and useful rather than decorative.",
      "- Strong spacing rhythm with clear hierarchy between intro, content, and CTA.",
      "- Use real imagery when available; otherwise use a safe placeholder that can be replaced in the editor.",
      "",
      "## Class Manager Plan",
      "- Create reusable classes for section wrapper, card, heading, text, button, and image/media.",
      "- Prefer class references over repeated inline styles.",
      "- Keep class names lowercase kebab-case.",
      "",
      "## Responsive Notes",
      "- Stack content on mobile.",
      "- Keep cards readable with comfortable gaps.",
      "- Ensure buttons are easy to tap.",
      "",
      "## Implementation Notes",
      "- Build with existing Blockish blocks.",
      "- Use Container for layout and cards.",
      "- Use Heading as paragraph text when needed.",
      "- Use Image and Button blocks where the section requires media and CTA.",
    ].filter(Boolean).join("\n"),
    assets: {
      icons: [],
      images: [],
      videos: [],
    },
  };
}

function createDesignerSystemPrompt(): string {
  return [
    "You are the Blockish Designer subagent.",
    "Your job is to turn a Product Manager brief into a creative, implementation-ready design brief for Blockish/Gutenberg pages and sections.",
    "You do not talk to the user directly. Return your final designer output to the Product Manager.",
    "",
    "## Design Standards",
    "- Create visually strong, modern, useful layouts, not plain markup.",
    "- Match the requested scope exactly: full page, one section, selected blocks, or one block.",
    "- Use real hierarchy: spacing, rhythm, section structure, content priority, responsive behavior, and visual emphasis.",
    "- Prefer designs that can be built with existing Blockish blocks and extensions.",
    "- Use Class Manager in the design direction for reusable section, card, text, button, image, and state styles.",
    "- Blockish icons must be SVG, not emoji, icon names, PNG, or font-only icons.",
    "- If a missing block would materially improve future quality, call suggest_missing_block, then still provide the closest current Blockish workaround.",
    "",
    "## Tool Use",
    "- Use read_blockish_overview when Blockish capabilities matter.",
    "- Use search_docs for specific Blockish docs, especially Class Manager and available blocks.",
    "- Use collect_image_assets, collect_video_assets, or collect_icon_assets when the design needs visual assets.",
    "- Keep asset recommendations concrete: URL/source, purpose, placement, and fallback.",
    "",
    "## Designer Output",
    "Return exactly two useful things to the Product Manager: a design brief and selected assets.",
    "The design brief should include: design intent, section/block structure, layout notes, visual style, Class Manager plan, asset plan, responsive behavior, and implementation notes.",
    "Assets must be grouped as icons, images, and videos.",
    "Icon assets must include inline SVG when available because Blockish icon fields accept SVG only.",
    "Do not generate Gutenberg schema JSON.",
  ].join("\n");
}

function createDesignerAgent(input: CreateDesignerToolInput) {
  return createAgent({
    model: createModel({ ...input.modelConfig, temperature: 0.9 }),
    systemPrompt: createDesignerSystemPrompt(),
    responseFormat: designerResponseSchema,
    middleware: [
      createToolEventMiddleware("designer"),
    ],
    tools: [
      createReadBlockishOverviewTool(),
      createSearchDocsTool(),
      createCollectImageAssetsTool(),
      createCollectVideoAssetsTool(),
      createCollectIconAssetsTool(),
      createSuggestMissingBlockTool(),
    ],
  });
}

export function createDesignerTool(input: CreateDesignerToolInput) {
  const designerAgent = createDesignerAgent(input);

  return tool(
    async ({ brief, context }) => {
      const result = await designerAgent.invoke({
        messages: [
          {
            role: "user",
            content: [
              "Create Blockish designer output from this brief.",
              "",
              "## Product Manager Brief",
              brief,
              "",
              context ? `## Additional Context\n${context}` : "",
            ].join("\n"),
          },
        ],
      });
      const extracted = extractAgentStructuredOutput(
        result,
        normalizeDesignerResponse
      );

      if (!extracted.value) {
        console.warn("[Blockish AI][designer:unparsed_output]", {
          rawText: extracted.rawText,
          structuredResponse: (result as { structuredResponse?: unknown })
            .structuredResponse,
        });
      }

      return JSON.stringify(
        extracted.value ?? createDesignerFallbackResponse(brief, context)
      );
    },
    {
      name: "designer",
      description: "Create a creative, implementation-ready Blockish design brief and selected assets from a Product Manager brief. Use this for pages, templates, complex sections, visual direction, layout planning, and asset planning.",
      schema: designerToolSchema,
    }
  );
}
