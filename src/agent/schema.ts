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
    value: value as BlockishGeneratedResponse,
  };
}
