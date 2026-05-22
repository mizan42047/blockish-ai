export type BlockishClassManagerCreate = {
  content: Record<string, unknown>;
  parent?: number | string;
  status?: string;
  tempId?: string;
  title: string;
};

export type BlockishClassManagerUpdate = {
  content: Record<string, unknown>;
  id: number;
  reason?: string;
  title?: string;
};

export type BlockishSchemaBlock = {
  attributes: Record<string, unknown>;
  innerBlocks: BlockishSchemaBlock[];
  name: string;
};

export type BlockishGeneratedSchema = {
  blocks: BlockishSchemaBlock[];
  extensions: {
    classManager?: {
      create?: BlockishClassManagerCreate[];
      update?: BlockishClassManagerUpdate[];
    };
    [key: string]: unknown;
  };
  mode: string;
  scope: "full_page" | "selection";
};

export type BlockishGeneratedResponse = {
  message: string;
  schema: {
    new: BlockishGeneratedSchema;
  };
  summary: string;
};

export type SchemaValidationResult = {
  errors: string[];
  value: BlockishGeneratedResponse | null;
};

export const generatedResponseContractName = "BlockishGeneratedResponse";

const fallbackImageUrl =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='800' viewBox='0 0 1200 800'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop stop-color='%23f4f7fb'/%3E%3Cstop offset='.55' stop-color='%23dfe8f7'/%3E%3Cstop offset='1' stop-color='%23111827'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1200' height='800' fill='url(%23g)'/%3E%3Ccircle cx='920' cy='190' r='190' fill='%23ffffff' opacity='.18'/%3E%3Ccircle cx='230' cy='630' r='260' fill='%230f172a' opacity='.08'/%3E%3Cpath d='M220 520 390 350l130 130 120-120 340 340H220z' fill='%23ffffff' opacity='.76'/%3E%3Ccircle cx='425' cy='260' r='58' fill='%23ffffff' opacity='.82'/%3E%3C/svg%3E";

const defaultClassManagerCreates: BlockishClassManagerCreate[] = [
  {
    tempId: "ai-section",
    title: "ai-section",
    status: "publish",
    content: {
      customCss:
        "{{SELECTOR}}{padding:clamp(56px,8vw,104px) clamp(20px,5vw,72px);position:relative;overflow:hidden;background:linear-gradient(135deg,#f7f8fb 0%,#ffffff 48%,#eef5ff 100%);}",
    },
  },
  {
    tempId: "ai-card",
    title: "ai-card",
    status: "publish",
    content: {
      customCss:
        "{{SELECTOR}}{padding:clamp(22px,3vw,34px);border:1px solid rgba(17,24,39,.1);border-radius:22px;background:rgba(255,255,255,.92);box-shadow:0 18px 48px rgba(15,23,42,.08);transition:transform .2s ease,box-shadow .2s ease;}{{SELECTOR}}:hover{transform:translateY(-4px);box-shadow:0 24px 64px rgba(15,23,42,.12);}",
    },
  },
  {
    tempId: "ai-heading",
    title: "ai-heading",
    status: "publish",
    content: {
      customCss:
        "{{SELECTOR}}{font-weight:800;letter-spacing:0;line-height:1.05;color:#101114;margin:0;}",
    },
  },
  {
    tempId: "ai-text",
    title: "ai-text",
    status: "publish",
    content: {
      customCss:
        "{{SELECTOR}}{color:#5f6673;line-height:1.7;margin:0;max-width:64ch;}",
    },
  },
  {
    tempId: "ai-button",
    title: "ai-button",
    status: "publish",
    content: {
      customCss:
        "{{SELECTOR}}{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 24px;border-radius:999px;background:#111827;color:#fff;font-weight:700;text-decoration:none;box-shadow:0 14px 30px rgba(17,24,39,.18);transition:transform .2s ease,box-shadow .2s ease;}{{SELECTOR}}:hover{transform:translateY(-2px);box-shadow:0 18px 40px rgba(17,24,39,.24);}",
    },
  },
  {
    tempId: "ai-image",
    title: "ai-image",
    status: "publish",
    content: {
      customCss:
        "{{SELECTOR}}{overflow:hidden;border-radius:24px;}{{SELECTOR}} .blockish-image{display:block;width:100%;height:100%;object-fit:cover;}",
    },
  },
];

const supportedBlockNames = new Set([
  "blockish/accordion",
  "blockish/accordion-item",
  "blockish/button",
  "blockish/container",
  "blockish/counter",
  "blockish/google-map",
  "blockish/heading",
  "blockish/icon",
  "blockish/icon-list",
  "blockish/icon-list-item",
  "blockish/image",
  "blockish/progress-bar",
  "blockish/progress-bar-item",
  "blockish/rating",
  "blockish/social-icons",
  "blockish/social-icons-item",
  "blockish/tab",
  "blockish/tab-item",
  "blockish/video",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isValidScope(value: unknown): value is "full_page" | "selection" {
  return value === "full_page" || value === "selection";
}

function validateClassManagerCreate(
  item: unknown,
  path: string,
  errors: string[]
): item is BlockishClassManagerCreate {
  if (!isRecord(item)) {
    errors.push(`${path} must be an object.`);
    return false;
  }

  if (typeof item.title !== "string" || !item.title.trim()) {
    errors.push(`${path}.title must be a non-empty string.`);
  }

  if (!isRecord(item.content)) {
    errors.push(`${path}.content must be an object.`);
  }

  if (
    item.tempId !== undefined &&
    (typeof item.tempId !== "string" || !item.tempId.trim())
  ) {
    errors.push(`${path}.tempId must be a non-empty string when provided.`);
  }

  if (
    item.parent !== undefined &&
    typeof item.parent !== "number" &&
    typeof item.parent !== "string"
  ) {
    errors.push(`${path}.parent must be a number or tempId string when provided.`);
  }

  return true;
}

function validateClassManagerUpdate(
  item: unknown,
  path: string,
  errors: string[]
): item is BlockishClassManagerUpdate {
  if (!isRecord(item)) {
    errors.push(`${path} must be an object.`);
    return false;
  }

  if (typeof item.id !== "number" || !Number.isFinite(item.id)) {
    errors.push(`${path}.id must be a finite number.`);
  }

  if (!isRecord(item.content)) {
    errors.push(`${path}.content must be an object.`);
  }

  if (item.title !== undefined && typeof item.title !== "string") {
    errors.push(`${path}.title must be a string when provided.`);
  }

  if (item.reason !== undefined && typeof item.reason !== "string") {
    errors.push(`${path}.reason must be a string when provided.`);
  }

  return true;
}

function validateClassManager(value: unknown, errors: string[]) {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    errors.push("schema.new.extensions.classManager must be an object.");
    return;
  }

  if (value.create !== undefined) {
    if (!Array.isArray(value.create)) {
      errors.push("schema.new.extensions.classManager.create must be an array.");
    } else {
      value.create.forEach((item, index) => {
        validateClassManagerCreate(
          item,
          `schema.new.extensions.classManager.create[${index}]`,
          errors
        );
      });
    }
  }

  if (value.update !== undefined) {
    if (!Array.isArray(value.update)) {
      errors.push("schema.new.extensions.classManager.update must be an array.");
    } else {
      value.update.forEach((item, index) => {
        validateClassManagerUpdate(
          item,
          `schema.new.extensions.classManager.update[${index}]`,
          errors
        );
      });
    }
  }
}

function validateBlock(
  block: unknown,
  path: string,
  errors: string[]
): block is BlockishSchemaBlock {
  if (!isRecord(block)) {
    errors.push(`${path} must be an object.`);
    return false;
  }

  if (typeof block.name !== "string" || !block.name.trim()) {
    errors.push(`${path}.name must be a non-empty string.`);
  } else if (block.name === "blockish/paragraph") {
    errors.push(`${path}.name must not be blockish/paragraph. Use blockish/heading with paragraph-style attributes instead.`);
  } else if (
    block.name.startsWith("blockish/") &&
    !supportedBlockNames.has(block.name)
  ) {
    errors.push(`${path}.name uses unsupported Blockish block ${block.name}.`);
  }

  if (!isRecord(block.attributes)) {
    errors.push(`${path}.attributes must be an object.`);
  }

  if (!Array.isArray(block.innerBlocks)) {
    errors.push(`${path}.innerBlocks must be an array.`);
    return false;
  }

  block.innerBlocks.forEach((innerBlock, index) => {
    validateBlock(innerBlock, `${path}.innerBlocks[${index}]`, errors);
  });

  return true;
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

function isUsableImageUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const url = value.trim();

  if (!/^(https?:\/\/|data:image\/)/i.test(url) || /[\s{}]/.test(url)) {
    return false;
  }

  if (url.startsWith("data:image/")) {
    return true;
  }

  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();

    return ![
      "example.com",
      "example.org",
      "example.net",
      "yourdomain.com",
      "localhost",
      "via.placeholder.com",
      "placehold.co",
      "blockish.io",
    ].includes(hostname);
  } catch {
    return false;
  }
}

function normalizeImageAttributes(attributes: Record<string, unknown>) {
  const imageValue = attributes.image;
  const image = isRecord(attributes.image)
    ? (attributes.image as Record<string, unknown>)
    : {};
  const nestedMedia = isRecord(attributes.media)
    ? (attributes.media as Record<string, unknown>)
    : {};
  const url =
    (typeof imageValue === "string" && imageValue.trim()
      ? imageValue.trim()
      : null) ??
    getStringField(image, ["url", "source_url", "src"]) ??
    getStringField(nestedMedia, ["url", "source_url", "src"]) ??
    getStringField(attributes, ["url", "imageUrl", "src"]) ??
    fallbackImageUrl;
  const alt =
    getStringField(attributes, ["alt", "title"]) ??
    getStringField(image, ["alt", "title"]) ??
    "Generated section image";

  attributes.image = {
    ...image,
    url: isUsableImageUrl(url) ? url : fallbackImageUrl,
    alt,
    width: typeof image.width === "number" ? image.width : 1200,
    height: typeof image.height === "number" ? image.height : 800,
  };
  attributes.alt = alt;

  if (!isRecord(attributes.imageSize)) {
    attributes.imageSize = { value: "full", label: "Full Size" };
  }
}

function hasClassReference(
  attributes: Record<string, unknown>,
  tempId: string
) {
  if (!Array.isArray(attributes.classManager)) {
    return false;
  }

  return attributes.classManager.some((item) => {
    if (!isRecord(item)) {
      return false;
    }

    return item.tempId === tempId || item.title === tempId;
  });
}

function addClassReference(
  attributes: Record<string, unknown>,
  tempId: string
) {
  if (hasClassReference(attributes, tempId)) {
    return;
  }

  const classManager = Array.isArray(attributes.classManager)
    ? attributes.classManager
    : [];

  attributes.classManager = [
    ...classManager,
    {
      tempId,
      title: tempId,
    },
  ];
}

function getHeadingTag(attributes: Record<string, unknown>) {
  const tag = attributes.tag;

  if (isRecord(tag) && typeof tag.value === "string") {
    return tag.value.toLowerCase();
  }

  if (typeof tag === "string") {
    return tag.toLowerCase();
  }

  return "";
}

function ensureDefaultClassManager(schema: BlockishGeneratedSchema) {
  const classManager = isRecord(schema.extensions.classManager)
    ? schema.extensions.classManager
    : {};
  const createItems = Array.isArray(classManager.create)
    ? classManager.create
    : [];
  const existingTitles = new Set(
    createItems
      .map((item) => item?.title)
      .filter((title): title is string => typeof title === "string")
  );
  const missingItems = defaultClassManagerCreates.filter(
    (item) => !existingTitles.has(item.title)
  );

  schema.extensions.classManager = {
    ...classManager,
    create: [...createItems, ...missingItems],
  };
}

function normalizeBlock(block: BlockishSchemaBlock, depth = 0) {
  if (block.name === "blockish/container") {
    block.attributes.isVariationPicked = true;
    addClassReference(block.attributes, depth === 0 ? "ai-section" : "ai-card");
  }

  if (block.name === "blockish/image") {
    normalizeImageAttributes(block.attributes);
    addClassReference(block.attributes, "ai-image");
  }

  if (block.name === "blockish/button") {
    addClassReference(block.attributes, "ai-button");
  }

  if (block.name === "blockish/heading") {
    const tag = getHeadingTag(block.attributes);
    addClassReference(
      block.attributes,
      tag === "p" || tag === "span" ? "ai-text" : "ai-heading"
    );
  }

  block.innerBlocks.forEach((innerBlock) => normalizeBlock(innerBlock, depth + 1));
}

export function normalizeGeneratedResponse(
  response: BlockishGeneratedResponse
): BlockishGeneratedResponse {
  ensureDefaultClassManager(response.schema.new);
  response.schema.new.blocks.forEach((block) => normalizeBlock(block));

  return response;
}

export function validateGeneratedResponse(
  value: unknown
): SchemaValidationResult {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return {
      errors: [`${generatedResponseContractName} must be an object.`],
      value: null,
    };
  }

  if (typeof value.message !== "string" || !value.message.trim()) {
    errors.push("message must be a non-empty string.");
  }

  if (typeof value.summary !== "string" || !value.summary.trim()) {
    errors.push("summary must be a non-empty string.");
  }

  if (!isRecord(value.schema)) {
    errors.push("schema must be an object.");
  }

  const schemaNew = isRecord(value.schema)
    ? (value.schema.new as unknown)
    : null;

  if (!isRecord(schemaNew)) {
    errors.push("schema.new must be an object.");
  } else {
    if (!isValidScope(schemaNew.scope)) {
      errors.push("schema.new.scope must be full_page or selection.");
    }

    if (typeof schemaNew.mode !== "string" || !schemaNew.mode.trim()) {
      errors.push("schema.new.mode must be a non-empty string.");
    }

    if (!isRecord(schemaNew.extensions)) {
      errors.push("schema.new.extensions must be an object.");
    } else {
      validateClassManager(schemaNew.extensions.classManager, errors);
    }

    if (!Array.isArray(schemaNew.blocks)) {
      errors.push("schema.new.blocks must be an array.");
    } else {
      schemaNew.blocks.forEach((block, index) => {
        validateBlock(block, `schema.new.blocks[${index}]`, errors);
      });
    }
  }

  if (errors.length) {
    return { errors, value: null };
  }

  return {
    errors: [],
    value: normalizeGeneratedResponse(value as BlockishGeneratedResponse),
  };
}
