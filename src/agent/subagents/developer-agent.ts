import { createAgent, tool } from "langchain";
import { z } from "zod";
import {
  type BlockishGeneratedResponse,
  type BlockishSchemaBlock,
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
import { extractAgentStructuredOutput } from "agent/utility/agent-output.js";
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

type DeveloperInvocationResult = {
  parsedCandidate: unknown;
  rawText: string | null;
  value: DeveloperResponse | null;
};

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

function truncateDocContent(content: string, maxLength = 1200): string {
  return content.length <= maxLength
    ? content
    : `${content.slice(0, maxLength)}\n...[truncated]`;
}

function createDeveloperContractGuide(): string {
  return [
    "Return exactly one JSON object that matches this TypeScript shape:",
    "",
    "type BlockishGeneratedResponse = {",
    "  message: string;",
    "  summary: string;",
    "  schema: {",
    "    new: {",
    "      mode: string;",
    "      scope: \"full_page\" | \"selection\";",
    "      extensions: {",
    "        classManager?: {",
    "          create?: Array<{",
    "            tempId?: string;",
    "            title: string;",
    "            status?: string;",
    "            content: Record<string, unknown>;",
    "          }>;",
    "        };",
    "      };",
    "      blocks: Array<{",
    "        name: string;",
    "        attributes: Record<string, unknown>;",
    "        innerBlocks: BlockishGeneratedBlock[];",
    "      }>;",
    "    };",
    "  };",
    "};",
    "",
    "Rules:",
    "- Do not return a JSON schema definition.",
    "- Do not use keys like type, data, settings, fields, properties, or content as block wrappers.",
    "- Every block object must use name, attributes, and innerBlocks.",
    "- Use block names like blockish/container, blockish/heading, blockish/image, blockish/button, blockish/accordion.",
    "- Container attributes must include isVariationPicked: true.",
    "- Heading with tag value p is paragraph text. Never use blockish/paragraph.",
    "",
    "Minimal valid example:",
    JSON.stringify({
      message: "Created a Blockish section.",
      summary: "Generated one section with Class Manager styles.",
      schema: {
        new: {
          mode: "blocks",
          scope: "full_page",
          extensions: {
            classManager: {
              create: [
                {
                  tempId: "ai-section",
                  title: "ai-section",
                  status: "publish",
                  content: {
                    customCss: "{{SELECTOR}}{padding:72px 24px;background:#ffffff;}",
                  },
                },
              ],
            },
          },
          blocks: [
            {
              name: "blockish/container",
              attributes: {
                isVariationPicked: true,
                tagName: { label: "Section", value: "section" },
                classManager: [{ tempId: "ai-section", title: "ai-section" }],
              },
              innerBlocks: [
                {
                  name: "blockish/heading",
                  attributes: {
                    content: "Section heading",
                    tag: { label: "H2", value: "h2" },
                  },
                  innerBlocks: [],
                },
                {
                  name: "blockish/heading",
                  attributes: {
                    content: "Paragraph text goes in Heading with tag p.",
                    tag: { label: "P", value: "p" },
                  },
                  innerBlocks: [],
                },
              ],
            },
          ],
        },
      },
    }, null, 2),
  ].join("\n");
}

function collectRelevantDocTitles(text: string): string[] {
  const lowerText = text.toLowerCase();
  const titles = new Set<string>(["Class Manager", "Container", "Heading"]);

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

  if (parsed.success) {
    return parsed.data;
  }

  return coerceGenericDeveloperResponse(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getNestedRecord(
  value: Record<string, unknown>,
  key: string
): Record<string, unknown> | null {
  const nested = value[key];

  return isRecord(nested) ? nested : null;
}

function unwrapGenericBlockValue(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null;
  }

  return isRecord(value.block) ? value.block : value;
}

function getArrayField(
  value: Record<string, unknown>,
  keys: string[]
): unknown[] {
  for (const key of keys) {
    const field = value[key];

    if (Array.isArray(field)) {
      return field;
    }

    if (isRecord(field)) {
      return Object.entries(field).map(([entryKey, entryValue]) => (
        isRecord(entryValue)
          ? {
            type: entryKey,
            title: entryKey,
            ...entryValue,
          }
          : entryValue
      ));
    }
  }

  return [];
}

function getStringField(
  value: Record<string, unknown>,
  keys: string[]
): string | null {
  for (const key of keys) {
    const field = value[key];

    if (typeof field === "string" && field.trim()) {
      return field.trim();
    }
  }

  return null;
}

function normalizeClassName(value: string): string {
  return value
    .trim()
    .replace(/^\./, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function createClassReference(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const tempId = normalizeClassName(value);

  return tempId ? { tempId, title: tempId } : null;
}

function createClassReferences(value: unknown): Array<{
  tempId: string;
  title: string;
}> {
  if (typeof value === "string") {
    const reference = createClassReference(value);

    return reference ? [reference] : [];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(createClassReference)
    .filter((reference): reference is {
      tempId: string;
      title: string;
    } => Boolean(reference));
}

function camelToKebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
}

function cssPropertyFromStyle(style: Record<string, unknown>): string | null {
  const property = getStringField(style, ["property", "name", "key"]);

  return property ? camelToKebabCase(property) : null;
}

function cssValueFromStyle(style: Record<string, unknown>): string | null {
  const value = style.value;

  if (typeof value === "number") {
    return String(value);
  }

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function createCustomCssFromStyles(
  selector: string,
  styles: unknown
): string | null {
  if (!Array.isArray(styles)) {
    return null;
  }

  const declarations = styles
    .map((style) => {
      if (!isRecord(style)) {
        return null;
      }

      const property = cssPropertyFromStyle(style);
      const value = cssValueFromStyle(style);

      return property && value ? `${property}:${value};` : null;
    })
    .filter((declaration): declaration is string => Boolean(declaration));

  if (!declarations.length) {
    return null;
  }

  return `{{SELECTOR}}{${declarations.join("")}}`;
}

function createCustomCssFromStyleObject(
  styles: Record<string, unknown>
): string | null {
  const ignoredKeys = new Set([
    "class",
    "className",
    "classes",
    "content",
    "id",
    "name",
    "parent",
    "properties",
    "selector",
    "settings",
    "status",
    "styles",
    "tempId",
    "title",
    "type",
  ]);
  const declarations = Object.entries(styles)
    .map(([property, value]) => {
      if (ignoredKeys.has(property)) {
        return null;
      }

      if (typeof value !== "string" && typeof value !== "number") {
        return null;
      }

      return `${camelToKebabCase(property)}:${String(value)};`;
    })
    .filter((declaration): declaration is string => Boolean(declaration));

  return declarations.length ? `{{SELECTOR}}{${declarations.join("")}}` : null;
}

function coerceClassManagerCreate(item: unknown): unknown | null {
  if (!isRecord(item)) {
    return null;
  }

  const rawTitle = getStringField(item, ["title", "name", "class", "selector"]);

  if (!rawTitle) {
    return null;
  }

  const title = normalizeClassName(rawTitle);
  const customCss = createCustomCssFromStyles(rawTitle, item.styles) ??
    createCustomCssFromStyleObject(item);
  const content =
    getNestedRecord(item, "content") ??
    getNestedRecord(item, "properties") ??
    getNestedRecord(item, "settings") ??
    (customCss ? { customCss } : {});

  return {
    tempId: title,
    title,
    status: typeof item.status === "string" ? item.status : "publish",
    content,
  };
}

function collectGenericChildren(value: Record<string, unknown>): unknown[] {
  const block = unwrapGenericBlockValue(value) ?? value;

  return [
    ...getArrayField(block, ["children", "innerBlocks", "content", "items"]),
    ...getArrayField(getNestedRecord(block, "data") ?? {}, ["children", "content", "items"]),
    ...getArrayField(getNestedRecord(block, "settings") ?? {}, ["children", "content", "items"]),
    ...getArrayField(getNestedRecord(block, "attrs") ?? {}, ["children", "content", "items"]),
  ];
}

function getGenericBlockType(value: Record<string, unknown>): string {
  const block = unwrapGenericBlockValue(value) ?? value;

  return (
    getStringField(block, ["type", "name", "blockName"]) ??
    "container"
  ).toLowerCase();
}

function coerceGenericAttributes(
  value: Record<string, unknown>,
  blockName: string
): Record<string, unknown> {
  const block = unwrapGenericBlockValue(value) ?? value;
  const data = getNestedRecord(block, "data") ?? {};
  const settings = getNestedRecord(block, "settings") ?? {};
  const attrs = getNestedRecord(block, "attrs") ?? {};
  const sourceAttributes = getNestedRecord(block, "attributes") ?? {};
  const attributes: Record<string, unknown> = {
    ...settings,
    ...data,
    ...attrs,
    ...sourceAttributes,
  };
  const classReferences = [
    ...createClassReferences(block.class),
    ...createClassReferences(block.className),
    ...createClassReferences(block.classes),
    ...createClassReferences(attrs.class),
    ...createClassReferences(attrs.className),
    ...createClassReferences(attrs.classes),
    ...createClassReferences(data.class),
    ...createClassReferences(data.className),
    ...createClassReferences(data.classes),
    ...createClassReferences(settings.class),
    ...createClassReferences(settings.className),
    ...createClassReferences(settings.classes),
  ];

  if (classReferences.length) {
    attributes.classManager = classReferences;
  }

  if (blockName === "blockish/container") {
    attributes.isVariationPicked = true;
  }

  if (blockName === "blockish/heading") {
    const content = getStringField(block, ["text", "content", "title", "label"]) ??
      getStringField(attrs, ["text", "content", "title", "label"]) ??
      getStringField(data, ["text", "content", "title", "label"]) ??
      getStringField(settings, ["text", "content", "title", "label"]) ??
      "Text";
    const type = getGenericBlockType(value);
    const level = typeof settings.level === "number"
      ? settings.level
      : typeof data.level === "number"
        ? data.level
        : null;
    const tagValue = type === "text" || type === "paragraph"
      ? "p"
      : level
        ? `h${Math.max(1, Math.min(6, level))}`
        : "h3";

    attributes.content = content;
    attributes.tag = {
      label: tagValue.toUpperCase(),
      value: tagValue,
    };
  }

  if (blockName === "blockish/button") {
    const text = getStringField(block, ["text", "content", "label"]) ??
      getStringField(attrs, ["text", "content", "label"]) ??
      getStringField(data, ["text", "content", "label"]) ??
      getStringField(settings, ["text", "content", "label"]) ??
      "Learn more";
    const link = getNestedRecord(attributes, "link");

    attributes.text = text;
    attributes.url = getNestedRecord(attributes, "url") ??
      (link
        ? {
          url: typeof link.url === "string" ? link.url : "#",
          newTab: Boolean(link.newTab),
          noFollow: Boolean(link.noFollow),
          customAttributes: [],
        }
        : {
          url: typeof attributes.url === "string" ? attributes.url : "#",
          newTab: false,
          noFollow: false,
          customAttributes: [],
        });
  }

  if (blockName === "blockish/image") {
    const image = getNestedRecord(attributes, "image") ?? {};
    const url = getStringField(block, ["url", "src"]) ??
      getStringField(attrs, ["url", "src"]) ??
      getStringField(data, ["url", "src"]) ??
      getStringField(settings, ["url", "src"]) ??
      getStringField(image, ["url", "src"]);
    const alt = getStringField(block, ["alt", "title"]) ??
      getStringField(attrs, ["alt", "title"]) ??
      getStringField(data, ["alt", "title"]) ??
      getStringField(settings, ["alt", "title"]) ??
      getStringField(image, ["alt", "title"]) ??
      "Generated image";

    attributes.image = {
      ...image,
      ...(url ? { url } : {}),
      alt,
    };
    attributes.alt = alt;
  }

  if (blockName === "blockish/accordion-item") {
    attributes.title = getStringField(block, ["title", "question", "label", "content", "text"]) ??
      getStringField(attrs, ["title", "question", "label", "content", "text"]) ??
      getStringField(data, ["title", "question", "label", "content", "text"]) ??
      getStringField(settings, ["title", "question", "label", "content", "text"]) ??
      "Question";
  }

  return attributes;
}

function coerceGenericBlock(value: unknown): BlockishSchemaBlock | null {
  const block = unwrapGenericBlockValue(value);

  if (!block) {
    return null;
  }

  const type = getGenericBlockType(block);
  const blockName = type.startsWith("blockish/")
    ? type
    : type.includes("accordion-item")
    ? "blockish/accordion-item"
    : type.includes("accordion") || type.includes("faq")
      ? "blockish/accordion"
      : type.includes("button") || type.includes("cta")
        ? "blockish/button"
        : type.includes("image") || type.includes("photo") || type.includes("portrait")
          ? "blockish/image"
      : type.includes("heading") || type.includes("text") || type.includes("paragraph")
        ? "blockish/heading"
        : "blockish/container";
  const children = collectGenericChildren(block)
    .map(coerceGenericBlock)
    .filter((block): block is BlockishSchemaBlock => Boolean(block));

  return {
    name: blockName,
    attributes: coerceGenericAttributes(block, blockName),
    innerBlocks: blockName === "blockish/image" || blockName === "blockish/button"
      ? []
      : children,
  };
}

function getGenericSchemaSource(
  value: Record<string, unknown>
): Record<string, unknown> {
  const schema = getNestedRecord(value, "schema");
  const schemaNew = schema ? getNestedRecord(schema, "new") : null;

  return schemaNew ?? value;
}

function getRootBlockishBlocks(
  value: Record<string, unknown>
): unknown[] {
  return Object.entries(value)
    .filter(([key, blockValue]) => key.startsWith("blockish/") && isRecord(blockValue))
    .map(([blockName, attributes]) => ({
      blockName,
      attributes,
    }));
}

function coerceGenericDeveloperResponse(
  value: unknown
): DeveloperResponse | null {
  if (!isRecord(value)) {
    return null;
  }

  const source = getGenericSchemaSource(value);
  const rawBlocks = [
    ...(isRecord(source.block) ? [source.block] : []),
    ...getRootBlockishBlocks(source),
    ...getArrayField(source, ["blocks", "structure", "content", "schema.new.blocks"]),
  ];

  if (!rawBlocks.length) {
    return null;
  }

  const rawClassCreates = getArrayField(source, [
    "classManager",
    "classes",
    "schema.new.extensions.classManager.create",
  ]);
  const nestedExtensions = getNestedRecord(source, "extensions");
  const nestedClassManager = nestedExtensions
    ? getNestedRecord(nestedExtensions, "classManager")
    : null;
  const nestedClassCreates = nestedClassManager
    ? getArrayField(nestedClassManager, ["create"])
    : [];
  const blocks = rawBlocks
    .map(coerceGenericBlock)
    .filter((block): block is BlockishSchemaBlock => Boolean(block));
  const classCreates = [...rawClassCreates, ...nestedClassCreates]
    .map(coerceClassManagerCreate)
    .filter(Boolean);

  if (!blocks.length) {
    return null;
  }

  return {
    message: getStringField(value, ["message"]) ??
      "Created a Blockish schema from the developer output.",
    summary: getStringField(value, ["summary"]) ??
      "Coerced generic developer output into BlockishGeneratedResponse.",
    schema: {
      new: {
        blocks,
        extensions: {
          classManager: {
            create: classCreates as Array<{
              content: Record<string, unknown>;
              status?: string;
              tempId?: string;
              title: string;
            }>,
          },
        },
        mode: typeof source.mode === "string" ? source.mode : "blocks",
        scope: source.scope === "selection" ? "selection" : "full_page",
      },
    },
  };
}

function createHeadingBlock(
  content: string,
  tag = "h2"
): BlockishSchemaBlock {
  return {
    name: "blockish/heading",
    attributes: {
      content,
      tag: {
        label: tag.toUpperCase(),
        value: tag,
      },
    },
    innerBlocks: [],
  };
}

function createImageBlock(alt: string): BlockishSchemaBlock {
  return {
    name: "blockish/image",
    attributes: {
      alt,
    },
    innerBlocks: [],
  };
}

function createButtonBlock(text: string): BlockishSchemaBlock {
  return {
    name: "blockish/button",
    attributes: {
      text,
      url: "#",
    },
    innerBlocks: [],
  };
}

function createContainerBlock(
  innerBlocks: BlockishSchemaBlock[],
  attributes: Record<string, unknown> = {}
): BlockishSchemaBlock {
  return {
    name: "blockish/container",
    attributes: {
      isVariationPicked: true,
      ...attributes,
    },
    innerBlocks,
  };
}

function createTeamFallbackBlocks(): BlockishSchemaBlock[] {
  const trainers: Array<[string, string, string]> = [
    ["Alex Carter", "Strength Coach", "Builds focused strength programs for sustainable progress."],
    ["Maya Brooks", "Mobility Trainer", "Helps members move better, recover faster, and train with confidence."],
    ["Noah Kim", "Performance Coach", "Combines conditioning, nutrition habits, and accountability."],
  ];

  return [
    createContainerBlock([
      createHeadingBlock("Meet the coaches behind your next level", "h2"),
      createHeadingBlock(
        "Work with expert trainers who turn busy schedules into clear, achievable fitness plans.",
        "p"
      ),
      createContainerBlock(
        trainers.map(([name, role, bio]) => createContainerBlock([
          createImageBlock(`${name} portrait`),
          createHeadingBlock(name, "h3"),
          createHeadingBlock(role, "p"),
          createHeadingBlock(bio, "p"),
        ])),
        { layout: "team-grid" }
      ),
      createButtonBlock("Book a trial session"),
    ]),
  ];
}

function createFaqFallbackBlocks(): BlockishSchemaBlock[] {
  const questions: Array<[string, string]> = [
    ["How quickly can I get started?", "You can start as soon as the section or page is added and adjusted to your content."],
    ["Can I edit the generated content?", "Yes. The generated blocks are normal Blockish/Gutenberg blocks that can be edited after insertion."],
    ["Will it work on mobile?", "The layout is structured to be responsive and should be refined in the editor preview."],
    ["Can I reuse the styles?", "Yes. Shared styling is created through Class Manager so it can be reused and adjusted globally."],
  ];

  return [
    createContainerBlock([
      createHeadingBlock("Frequently asked questions", "h2"),
      createHeadingBlock(
        "Clear answers for the details visitors usually check before taking the next step.",
        "p"
      ),
      {
        name: "blockish/accordion",
        attributes: {},
        innerBlocks: questions.map(([question, answer]) => ({
          name: "blockish/accordion-item",
          attributes: {
            title: question,
          },
          innerBlocks: [
            createHeadingBlock(answer, "p"),
          ],
        })),
      },
    ]),
  ];
}

function createHeroFallbackBlocks(): BlockishSchemaBlock[] {
  return [
    createContainerBlock([
      createContainerBlock([
        createHeadingBlock("Build faster with a sharper Blockish layout", "h1"),
        createHeadingBlock(
          "Create a polished section with reusable styles, responsive structure, and editable Gutenberg blocks.",
          "p"
        ),
        createButtonBlock("Get started"),
      ]),
      createImageBlock("Generated hero visual"),
    ]),
  ];
}

function createPricingFallbackBlocks(): BlockishSchemaBlock[] {
  const plans: Array<[string, string, string]> = [
    ["Starter", "$19", "For simple sites and fast launches."],
    ["Pro", "$49", "For growing teams that need more design control."],
    ["Studio", "$99", "For agencies building repeatable client pages."],
  ];

  return [
    createContainerBlock([
      createHeadingBlock("Choose the plan that fits your workflow", "h2"),
      createHeadingBlock("Simple options with clear value at every level.", "p"),
      createContainerBlock(
        plans.map(([name, price, description]) => createContainerBlock([
          createHeadingBlock(name, "h3"),
          createHeadingBlock(price, "h2"),
          createHeadingBlock(description, "p"),
          createButtonBlock("Choose plan"),
        ])),
        { layout: "pricing-grid" }
      ),
    ]),
  ];
}

function createGenericFallbackBlocks(): BlockishSchemaBlock[] {
  return [
    createContainerBlock([
      createHeadingBlock("A focused section built with Blockish", "h2"),
      createHeadingBlock(
        "This fallback keeps the editor usable while the developer agent output is improved.",
        "p"
      ),
      createButtonBlock("Continue"),
    ]),
  ];
}

function createDeveloperFallbackResponse(
  text: string,
  errors: string[]
): BlockishGeneratedResponse {
  const lowerText = text.toLowerCase();
  const blocks = lowerText.includes("team")
    ? createTeamFallbackBlocks()
    : lowerText.includes("faq") || lowerText.includes("question")
      ? createFaqFallbackBlocks()
      : lowerText.includes("pricing")
        ? createPricingFallbackBlocks()
        : lowerText.includes("hero")
          ? createHeroFallbackBlocks()
          : createGenericFallbackBlocks();
  const fallback = validateGeneratedResponse({
    message: "I created a fallback Blockish schema while the developer output needs improvement.",
    summary: `Developer fallback used after validation failed: ${errors.join("; ")}`,
    schema: {
      new: {
        blocks,
        extensions: {
          classManager: {
            create: [],
          },
        },
        mode: "blocks",
        scope: "full_page",
      },
    },
  });

  return fallback.value ?? {
    message: "Developer could not produce a valid schema.",
    summary: `Schema validation failed: ${errors.join("; ")}`,
    schema: {
      new: {
        blocks: [],
        extensions: {},
        mode: "blocks",
        scope: "full_page",
      },
    },
  };
}

function collectBlockNames(blocks: BlockishSchemaBlock[]): string[] {
  return blocks.flatMap((block) => [
    block.name,
    ...collectBlockNames(block.innerBlocks),
  ]);
}

function blockHasMeaningfulContent(block: BlockishSchemaBlock): boolean {
  return Object.values(block.attributes).some((value) => {
    if (typeof value === "string") {
      return value.trim().length > 2 && value !== "Text";
    }

    if (isRecord(value)) {
      return Object.values(value).some((nestedValue) => (
        typeof nestedValue === "string" &&
        nestedValue.trim().length > 2 &&
        nestedValue !== "#"
      ));
    }

    return false;
  });
}

function isUsefulGeneratedResponse(response: BlockishGeneratedResponse): boolean {
  const blocks = response.schema.new.blocks;
  const names = collectBlockNames(blocks);
  const meaningfulBlockCount = names.filter((name) => name !== "blockish/container")
    .length;
  const hasMeaningfulContent = blocks.some((block) => (
    blockHasMeaningfulContent(block) ||
    block.innerBlocks.some(blockHasMeaningfulContent)
  ));

  return blocks.length > 0 && meaningfulBlockCount > 0 && hasMeaningfulContent;
}

function getBriefDefaults(text: string) {
  const lowerText = text.toLowerCase();

  if (lowerText.includes("hero")) {
    return {
      button: lowerText.includes("download") ? "Download Now" : "Get started",
      heading: lowerText.includes("blockish")
        ? "Build faster with Blockish"
        : "Create a stronger first impression",
      paragraph: lowerText.includes("blockish")
        ? "Design polished Gutenberg sections with reusable Blockish blocks and global styling."
        : "Introduce the offer clearly with focused copy, visual proof, and a direct call to action.",
    };
  }

  if (lowerText.includes("team")) {
    return {
      button: "Book a trial session",
      heading: "Meet the team",
      paragraph: "Work with experienced specialists who help customers move from interest to action.",
    };
  }

  if (lowerText.includes("faq") || lowerText.includes("question")) {
    return {
      button: "Contact support",
      heading: "Frequently asked questions",
      paragraph: "Clear answers to the questions visitors usually check before taking the next step.",
    };
  }

  return {
    button: "Continue",
    heading: "A focused Blockish section",
    paragraph: "A clean, reusable section structure generated for the current request.",
  };
}

function isWeakText(value: unknown): boolean {
  return typeof value !== "string" ||
    !value.trim() ||
    ["text", "heading text", "section heading", "intro text"].includes(
      value.trim().toLowerCase()
    );
}

function isWeakButtonText(value: unknown): boolean {
  return isWeakText(value) ||
    (typeof value === "string" &&
      ["learn more", "get started", "click here"].includes(
        value.trim().toLowerCase()
      ));
}

function isWeakAccordionTitle(value: unknown): boolean {
  return isWeakText(value) ||
    (typeof value === "string" &&
      ["question", "faq item", "accordion item"].includes(
        value.trim().toLowerCase()
      ));
}

function ensureTempClass(
  attributes: Record<string, unknown>,
  tempId: string
) {
  const classManager = Array.isArray(attributes.classManager)
    ? attributes.classManager
    : [];
  const hasClass = classManager.some((item) => (
    isRecord(item) &&
    (item.tempId === tempId || item.title === tempId)
  ));

  if (!hasClass) {
    attributes.classManager = [
      ...classManager,
      { tempId, title: tempId },
    ];
  }
}

function improveWeakBlockContent(
  block: BlockishSchemaBlock,
  defaults: ReturnType<typeof getBriefDefaults>,
  state: { headingSeen: boolean; paragraphSeen: boolean }
) {
  if (block.name === "blockish/heading") {
    const tag = isRecord(block.attributes.tag) &&
      typeof block.attributes.tag.value === "string"
      ? block.attributes.tag.value.toLowerCase()
      : "";

    if (isWeakText(block.attributes.content)) {
      if (tag === "p" || state.headingSeen) {
        block.attributes.content = defaults.paragraph;
        block.attributes.tag = { label: "P", value: "p" };
        ensureTempClass(block.attributes, "ai-text");
        state.paragraphSeen = true;
      } else {
        block.attributes.content = defaults.heading;
        block.attributes.tag = { label: "H1", value: "h1" };
        ensureTempClass(block.attributes, "ai-heading");
        state.headingSeen = true;
      }
    } else if (tag === "p") {
      ensureTempClass(block.attributes, "ai-text");
      state.paragraphSeen = true;
    } else {
      ensureTempClass(block.attributes, "ai-heading");
      state.headingSeen = true;
    }
  }

  if (block.name === "blockish/button" && isWeakButtonText(block.attributes.text)) {
    block.attributes.text = defaults.button;
  }

  block.innerBlocks.forEach((innerBlock) => {
    improveWeakBlockContent(innerBlock, defaults, state);
  });
}

function getHeadingContent(block: BlockishSchemaBlock): string | null {
  if (
    block.name !== "blockish/heading" ||
    typeof block.attributes.content !== "string" ||
    !block.attributes.content.trim()
  ) {
    return null;
  }

  return block.attributes.content.trim();
}

function improveAccordionItemSemantics(block: BlockishSchemaBlock) {
  if (block.name !== "blockish/accordion-item") {
    return;
  }

  const headings = block.innerBlocks.filter((innerBlock) => (
    innerBlock.name === "blockish/heading"
  ));
  const firstHeadingContent = headings[0] ? getHeadingContent(headings[0]) : null;

  if (firstHeadingContent && isWeakAccordionTitle(block.attributes.title)) {
    block.attributes.title = firstHeadingContent;
  }

  if (
    headings.length > 1 &&
    firstHeadingContent &&
    block.attributes.title === firstHeadingContent &&
    headings[0]
  ) {
    const headingToRemove = headings[0];

    block.innerBlocks = block.innerBlocks.filter((innerBlock, index) => (
      index !== block.innerBlocks.indexOf(headingToRemove)
    ));
  }

  block.innerBlocks.forEach((innerBlock) => {
    if (innerBlock.name !== "blockish/heading") {
      return;
    }

    innerBlock.attributes.tag = { label: "P", value: "p" };
    ensureTempClass(innerBlock.attributes, "ai-text");
  });
}

function improveBlockSemantics(block: BlockishSchemaBlock) {
  improveAccordionItemSemantics(block);

  block.innerBlocks.forEach(improveBlockSemantics);
}

function isLeafBlock(name: string): boolean {
  return [
    "blockish/button",
    "blockish/heading",
    "blockish/icon",
    "blockish/image",
    "blockish/video",
  ].includes(name);
}

function fixBlockStructure(block: BlockishSchemaBlock): BlockishSchemaBlock {
  const innerBlocks = block.innerBlocks.map(fixBlockStructure);

  if (isLeafBlock(block.name) && innerBlocks.length > 0) {
    const promotedChildren = block.name === "blockish/heading" &&
      !isWeakText(block.attributes.content)
      ? [
        {
          name: "blockish/heading",
          attributes: {
            ...block.attributes,
          },
          innerBlocks: [],
        },
        ...innerBlocks,
      ]
      : innerBlocks;

    return createContainerBlock(promotedChildren, {
      classManager: block.attributes.classManager,
      tagName: block.attributes.tagName ?? {
        label: "Section",
        value: "section",
      },
    });
  }

  return {
    ...block,
    innerBlocks,
  };
}

function wrapLooseTopLevelBlocks(
  blocks: BlockishSchemaBlock[]
): BlockishSchemaBlock[] {
  if (blocks.length <= 1) {
    return blocks;
  }

  return [
    createContainerBlock(blocks, {
      tagName: {
        label: "Section",
        value: "section",
      },
    }),
  ];
}

function improveWeakGeneratedResponse(
  response: BlockishGeneratedResponse,
  text: string
): BlockishGeneratedResponse {
  const defaults = getBriefDefaults(text);
  const state = { headingSeen: false, paragraphSeen: false };

  response.schema.new.blocks = wrapLooseTopLevelBlocks(
    response.schema.new.blocks.map(fixBlockStructure)
  );

  response.schema.new.blocks.forEach((block) => {
    improveWeakBlockContent(block, defaults, state);
    improveBlockSemantics(block);
  });

  return response;
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
): Promise<DeveloperInvocationResult> {
  const result = await developerAgent.invoke({
    messages: [{ role: "user", content }],
  });
  const extracted = extractAgentStructuredOutput(
    result,
    normalizeDeveloperResponse
  );

  if (!extracted.value) {
    console.warn("[Blockish AI][developer:unparsed_output]", {
      rawText: extracted.rawText,
      structuredResponse: (result as { structuredResponse?: unknown })
        .structuredResponse,
    });
  }

  return extracted;
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
        "## Required Output Contract",
        createDeveloperContractGuide(),
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
      const firstValidation = validateGeneratedResponse(firstOutput.value);

      if (
        firstValidation.value &&
        isUsefulGeneratedResponse(firstValidation.value)
      ) {
        return JSON.stringify(
          improveWeakGeneratedResponse(firstValidation.value, brief)
        );
      }

      const repairedOutput = await invokeDeveloper(
        developerAgent,
        [
          content,
          "",
          "## Repair Required",
          "Your previous output did not validate.",
          "Validation errors:",
          [
            ...firstValidation.errors,
            ...(firstValidation.value &&
            !isUsefulGeneratedResponse(firstValidation.value)
              ? ["Output validated but was too empty to use."]
              : []),
          ].map((error) => `- ${error}`).join("\n"),
          "",
          "Previous raw output:",
          firstOutput.rawText ??
          JSON.stringify(firstOutput.parsedCandidate, null, 2) ??
          "No raw output was available.",
          "",
          "Return a corrected BlockishGeneratedResponse.",
        ].join("\n")
      );
      const repairedValidation = validateGeneratedResponse(repairedOutput.value);

      return JSON.stringify(
        repairedValidation.value &&
        isUsefulGeneratedResponse(repairedValidation.value)
          ? improveWeakGeneratedResponse(repairedValidation.value, brief)
          :
        createDeveloperFallbackResponse(
          [brief, designBrief ?? "", context ?? ""].join("\n"),
          [
            ...firstValidation.errors,
            ...(firstValidation.value &&
            !isUsefulGeneratedResponse(firstValidation.value)
              ? ["Output validated but was too empty to use."]
              : []),
          ]
        )
      );
    },
    {
      name: "developer",
      description: "Generate a valid Blockish/Gutenberg schema from a Product Manager brief, approved design brief, and assets. Use after design approval or for simple direct-build tasks.",
      schema: developerToolSchema,
    }
  );
}
