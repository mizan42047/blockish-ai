export const DeveloperResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "schema"],
  properties: {
    summary: {
      type: "string",
    },
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["extensions", "blocks"],
      properties: {
        extensions: {
          type: "object",
          additionalProperties: true,
          default: {},
        },
        blocks: {
          type: "array",
          items: {
            $ref: "#/$defs/Block",
          },
        },
      },
    },
  },
  $defs: {
    Block: {
      type: "object",
      additionalProperties: false,
      required: ["name", "attributes", "innerBlocks"],
      properties: {
        name: {
          type: "string",
        },
        attributes: {
          type: "object",
          additionalProperties: true,
          default: {},
        },
        innerBlocks: {
          type: "array",
          items: {
            $ref: "#/$defs/Block",
          },
          default: [],
        },
      },
    },
  },
} as const;

export const DeveloperInputJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["designGuideline", "assets"],
  properties: {
    designGuideline: {
      type: "string",
    },
    assets: {
      type: "object",
      additionalProperties: false,
      required: ["icons", "images", "videos"],
      properties: {
        icons: {
          type: "object",
          additionalProperties: {
            type: "string",
          },
        },
        images: {
          type: "object",
          additionalProperties: {
            type: "string",
          },
        },
        videos: {
          type: "object",
          additionalProperties: {
            type: "string",
          },
        },
      },
    },
    classManager: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title"],
        properties: {
          id: {
            type: "number",
          },
          title: {
            type: "string",
          },
          attributes: {
            type: "object",
            additionalProperties: true,
          },
          parent: {
            type: "number",
          },
        },
      },
    },
  },
} as const;