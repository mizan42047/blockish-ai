import { createAgent, tool } from "langchain";
import { z } from "zod";
import {
  generatedResponseContractName,
  validateGeneratedResponse,
} from "agent/schema.js";
import {
  createReadBlockishOverviewTool,
  createSearchBlockDocsTool,
  createSearchDocsTool,
} from "agent/tools/index.js";
import {
  getDocumentByTitle,
  getDocuments,
} from "routes/document.ropository.js";
import {
  createModel,
  type CreateModelConfig,
} from "agent/utility/create-model.js";
import { createToolEventMiddleware } from "agent/utility/tool-event-middleware.js";

export type CreateDeveloperToolInput = {
  modelConfig: CreateModelConfig;
};

const developerToolSchema = z.object({
  assets: z
    .unknown()
    .optional()
    .describe("Designer-selected assets grouped as icons, images, and videos."),
  brief: z
    .string()
    .describe("Product Manager development brief with user requirements and scope."),
  context: z
    .string()
    .optional()
    .describe("Optional editor, class manager, or conversation context."),
  designBrief: z
    .string()
    .optional()
    .describe("Approved Designer brief or design direction."),
});

const classManagerCreateSchema = z.object({
  content: z.record(z.string(), z.unknown()),
  parent: z.union([z.number(), z.string()]).optional(),
  status: z.string().optional(),
  tempId: z.string().optional(),
  title: z.string(),
});

const classManagerUpdateSchema = z.object({
  content: z.record(z.string(), z.unknown()),
  id: z.number(),
  reason: z.string().optional(),
  title: z.string().optional(),
});

const blockSchema: z.ZodType<{
  attributes: Record<string, unknown>;
  innerBlocks: Array<{
    attributes: Record<string, unknown>;
    innerBlocks: unknown[];
    name: string;
  }>;
  name: string;
}> = z.lazy(() => z.object({
  attributes: z.record(z.string(), z.unknown()),
  innerBlocks: z.array(blockSchema),
  name: z.string(),
}));

const developerResponseSchema = z.object({
  message: z
    .string()
    .describe("Short user-facing confirmation."),
  schema: z.object({
    new: z.object({
      blocks: z.array(blockSchema),
      extensions: z.object({
        classManager: z.object({
          create: z.array(classManagerCreateSchema).optional(),
          update: z.array(classManagerUpdateSchema).optional(),
        }).optional(),
      }).catchall(z.unknown()),
      mode: z.string(),
      scope: z.enum(["full_page", "selection"]),
    }),
  }),
  summary: z
    .string()
    .describe("One-line internal summary of what was built."),
});

type DeveloperResponse = z.infer<typeof developerResponseSchema>;

const knownBlockDocs = [
  "Accordion",
  "Button",
  "Container",
  "Counter",
  "Google Map",
  "Heading",
  "Icon",
  "Icon List",
  "Image",
  "Progress Bar",
  "Rating",
  "Social Icons",
  "Tab",
  "Video",
];

const blockKeywords: Array<{ keywords: string[]; title: string }> = [
  { keywords: ["accordion", "faq", "question", "questions"], title: "Accordion" },
  { keywords: ["button", "cta", "call to action", "download", "signup", "sign up"], title: "Button" },
  { keywords: ["container", "section", "wrapper", "layout", "grid", "card", "columns"], title: "Container" },
  { keywords: ["counter", "stat", "stats", "metric", "number"], title: "Counter" },
  { keywords: ["map", "location", "address"], title: "Google Map" },
  { keywords: ["heading", "headline", "title", "text", "paragraph", "copy"], title: "Heading" },
  { keywords: ["icon"], title: "Icon" },
  { keywords: ["icon list", "benefit list", "list"], title: "Icon List" },
  { keywords: ["image", "photo", "picture", "team", "portrait", "gallery"], title: "Image" },
  { keywords: ["progress", "skill"], title: "Progress Bar" },
  { keywords: ["rating", "review", "star"], title: "Rating" },
  { keywords: ["social", "share"], title: "Social Icons" },
  { keywords: ["tab", "tabs"], title: "Tab" },
  { keywords: ["video", "motion"], title: "Video" },
];

function truncateDocContent(content: string, maxLength = 4500): string {
  return content.length <= maxLength
    ? content
    : `${content.slice(0, maxLength)}\n...[truncated]`;
}

function collectRelevantDocTitles(text: string): string[] {
  const lowerText = text.toLowerCase();
  const titles = new Set<string>(["Index", "Class Manager", "Container", "Heading"]);

  for (const { keywords, title } of blockKeywords) {
    if (keywords.some((keyword) => lowerText.includes(keyword))) {
      titles.add(title);
    }
  }

  if (titles.has("Accordion")) {
    titles.add("Button");
  }

  if (titles.has("Image")) {
    titles.add("Container");
  }

  return Array.from(titles);
}

async function getDeveloperDocumentContext(text: string): Promise<string> {
  const titles = collectRelevantDocTitles(text);
  const docs = await Promise.all(
    titles.map((title) => getDocumentByTitle(title))
  );
  const foundTitles = new Set(
    docs
      .filter(Boolean)
      .map((doc) => doc!.title.toLowerCase())
  );
  const missingTitles = knownBlockDocs.filter((title) => (
    titles.includes(title) && !foundTitles.has(title.toLowerCase())
  ));

  if (missingTitles.length) {
    const fallbackDocs = await getDocuments({
      search: missingTitles.join(" "),
      limit: missingTitles.length,
      orderBy: "updated_at",
      order: "desc",
    });

    docs.push(...fallbackDocs);
  }

  return docs
    .filter((doc): doc is NonNullable<typeof doc> => Boolean(doc))
    .map((doc) => [
      `## ${doc.title}`,
      `Category: ${doc.category}`,
      "",
      truncateDocContent(doc.content),
    ].join("\n"))
    .join("\n\n---\n\n");
}

function normalizeDeveloperResponse(value: unknown): DeveloperResponse | null {
  const parsed = developerResponseSchema.safeParse(value);

  return parsed.success ? parsed.data : null;
}

function createDeveloperSystemPrompt(): string {
  return [
    "You are the Blockish Developer subagent.",
    "Your job is to convert approved product/design briefs into a complete Blockish/Gutenberg schema.",
    "You do not talk to the user directly. Return final schema output to the Product Manager.",
    "",
    "## Required Behavior",
    "- Return a complete response that satisfies the Blockish generated response contract.",
    `- Contract name: ${generatedResponseContractName}.`,
    "- Use only supported Blockish/Gutenberg composition.",
    `- Supported Blockish block docs are: ${knownBlockDocs.join(", ")}.`,
    "- Use blockish/* blocks whenever Blockish provides that block.",
    "- Do not invent unsupported block names, attributes, or extension shapes.",
    "- Do not include clientId in generated blocks.",
    "- Every block must include name, attributes, and innerBlocks.",
    "- Container blocks must set isVariationPicked true.",
    "- Use Heading block as paragraph/text when appropriate; do not invent blockish/paragraph.",
    "",
    "## Documentation Rules",
    "- Call read_blockish_overview when you need available Blockish capability.",
    "- Call search_block_docs before writing attributes for each blockish/* block type you use.",
    "- Call search_docs with query 'Class Manager' before creating or updating Class Manager data.",
    "",
    "## Class Manager Rules",
    "- Class Manager is required for every generated design.",
    "- Prefer reusable classes over repeated inline styles.",
    "- Create or reuse classes for section wrapper, heading/text, card, button, image/media, and responsive states.",
    "- Put new reusable classes in schema.new.extensions.classManager.create.",
    "- Reference new classes from block attributes using tempId.",
    "- New class titles must be lowercase kebab-case without a leading dot.",
    "- Class content must be a plain JSON object accepted by Class Manager.",
    "- Use customCss with {{SELECTOR}} when structured controls are not enough.",
    "",
    "## Asset Rules",
    "- Use provided image/video/icon assets when they match the design.",
    "- Never output broken placeholder URLs like example.com, localhost, or empty image fields.",
    "- For icons, use inline SVG values when available because Blockish accepts SVG icons.",
    "",
    "## Output",
    "- Return valid structured output only.",
    "- Include message, summary, and schema.new.",
    "- schema.new must include mode, scope, extensions, and blocks.",
  ].join("\n");
}

function createDeveloperAgent(input: CreateDeveloperToolInput) {
  return createAgent({
    model: createModel({ ...input.modelConfig, temperature: 0.1 }),
    systemPrompt: createDeveloperSystemPrompt(),
    responseFormat: developerResponseSchema,
    middleware: [
      createToolEventMiddleware("developer"),
    ],
    tools: [
      createReadBlockishOverviewTool(),
      createSearchBlockDocsTool(),
      createSearchDocsTool(),
    ],
  });
}

async function invokeDeveloper(
  developerAgent: ReturnType<typeof createDeveloperAgent>,
  content: string
): Promise<DeveloperResponse | null> {
  const result = await developerAgent.invoke({
    messages: [{ role: "user", content }],
  });

  return normalizeDeveloperResponse(
    (result as { structuredResponse?: unknown }).structuredResponse
  );
}

export function createDeveloperTool(input: CreateDeveloperToolInput) {
  const developerAgent = createDeveloperAgent(input);

  return tool(
    async ({ assets, brief, context, designBrief }) => {
      const autoDocumentContext = await getDeveloperDocumentContext([
        brief,
        designBrief ?? "",
        assets ? JSON.stringify(assets) : "",
      ].join("\n"));
      const content = [
        "Create a complete Blockish generated schema from this development request.",
        "",
        "## Automatically Loaded Blockish Documentation",
        autoDocumentContext || "No matching Blockish documentation was found.",
        "",
        "## Product Manager Brief",
        brief,
        "",
        designBrief ? `## Approved Design Brief\n${designBrief}` : "",
        assets ? `## Designer Assets\n${JSON.stringify(assets, null, 2)}` : "",
        context ? `## Additional Context\n${context}` : "",
      ].join("\n");
      const firstOutput = await invokeDeveloper(developerAgent, content);
      const firstValidation = validateGeneratedResponse(firstOutput);

      if (firstValidation.value) {
        return JSON.stringify(firstValidation.value);
      }

      const repairedOutput = await invokeDeveloper(
        developerAgent,
        [
          content,
          "",
          "## Repair Required",
          "Your previous output did not validate.",
          "Validation errors:",
          firstValidation.errors.map((error) => `- ${error}`).join("\n"),
          "",
          "Return a corrected BlockishGeneratedResponse.",
        ].join("\n")
      );
      const repairedValidation = validateGeneratedResponse(repairedOutput);

      return JSON.stringify(repairedValidation.value ?? {
        message: "Developer could not produce a valid schema.",
        summary: `Schema validation failed: ${firstValidation.errors.join("; ")}`,
        schema: {
          new: {
            blocks: [],
            extensions: {},
            mode: "blocks",
            scope: "full_page",
          },
        },
      });
    },
    {
      name: "developer",
      description: "Generate a valid Blockish/Gutenberg schema from a Product Manager brief, approved design brief, and assets. Use after design approval or for simple direct-build tasks.",
      schema: developerToolSchema,
    }
  );
}
