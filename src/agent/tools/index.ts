import { tool } from "langchain";
import { getDocuments } from "routes/document.ropository.js";
import { upsertBlockSuggestion } from "routes/block-suggestions.repository.js";

type SearchBlockDocsToolInput = {
  blockName: string;
  limit?: number;
};

type SearchDocsToolInput = {
  limit?: number;
  query: string;
};

type SuggestMissingBlockToolInput = {
  exampleUsage?: string;
  metadata?: Record<string, unknown>;
  priority?: string;
  rationale: string;
  summary: string;
  title: string;
};

type CollectImageAssetsToolInput = {
  count?: number;
  keywords?: string[];
  mood?: string;
  section?: string;
};

type CollectVideoAssetsToolInput = {
  count?: number;
  keywords?: string[];
  mood?: string;
  section?: string;
};

type CollectIconAssetsToolInput = {
  count?: number;
  keywords?: string[];
  section?: string;
  style?: string;
};

type ImageAsset = {
  credit: string;
  keywords: string[];
  sourceUrl: string;
  title: string;
  url: string;
};

type IconAsset = {
  icon: string;
  keywords: string[];
  title: string;
};

const imageAssetLibrary: ImageAsset[] = [
  {
    title: "Modern website builder workspace",
    keywords: ["wordpress", "plugin", "website", "builder", "software", "saas"],
    url: "https://images.unsplash.com/photo-1498050108023-c5249f4df0852?auto=format&fit=crop&w=1600&q=80",
    sourceUrl: "https://unsplash.com/photos/turned-on-gray-laptop-computer-XJXWbfSo2f0",
    credit: "Unsplash",
  },
  {
    title: "Analytics and product dashboard",
    keywords: ["dashboard", "analytics", "growth", "business", "conversion", "saas"],
    url: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1600&q=80",
    sourceUrl: "https://unsplash.com/photos/person-using-macbook-pro-pypeCEaJeZY",
    credit: "Unsplash",
  },
  {
    title: "Collaborative product team",
    keywords: ["team", "agency", "collaboration", "creative", "design", "business"],
    url: "https://images.unsplash.com/photo-1551434678-e076c223a692?auto=format&fit=crop&w=1600&q=80",
    sourceUrl: "https://unsplash.com/photos/people-sitting-down-near-table-with-assorted-laptop-computers-Oalh2MojUuk",
    credit: "Unsplash",
  },
  {
    title: "Clean modern office interior",
    keywords: ["professional", "modern", "office", "startup", "clean", "workspace"],
    url: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1600&q=80",
    sourceUrl: "https://unsplash.com/photos/photo-of-office-turned-on-lights-6anudmpILw4",
    credit: "Unsplash",
  },
  {
    title: "Fitness training space",
    keywords: ["gym", "fitness", "training", "health", "exercise", "wellness"],
    url: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1600&q=80",
    sourceUrl: "https://unsplash.com/photos/man-carrying-barbell-inside-gym-lrQPTQs7nQQ",
    credit: "Unsplash",
  },
  {
    title: "Restaurant table and atmosphere",
    keywords: ["restaurant", "food", "cafe", "hospitality", "dining", "menu"],
    url: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1600&q=80",
    sourceUrl: "https://unsplash.com/photos/empty-tables-and-chairs-inside-building-poI7DelFiVA",
    credit: "Unsplash",
  },
  {
    title: "Online store packaging",
    keywords: ["shop", "ecommerce", "product", "store", "commerce", "retail"],
    url: "https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=1600&q=80",
    sourceUrl: "https://unsplash.com/photos/store-lot-with-assorted-clothes-1SAnrIxw5OY",
    credit: "Unsplash",
  },
];

const iconAssetLibrary: IconAsset[] = [
  {
    title: "Blocks",
    icon: "lucide:blocks",
    keywords: ["block", "blocks", "wordpress", "builder", "components"],
  },
  {
    title: "Plugin",
    icon: "lucide:puzzle",
    keywords: ["plugin", "extension", "addon", "integration"],
  },
  {
    title: "Layout",
    icon: "lucide:layout-template",
    keywords: ["layout", "template", "page", "section", "design"],
  },
  {
    title: "Style",
    icon: "lucide:palette",
    keywords: ["style", "design", "color", "brand", "creative"],
  },
  {
    title: "Fast",
    icon: "lucide:zap",
    keywords: ["fast", "speed", "performance", "efficient", "build"],
  },
  {
    title: "Reliable",
    icon: "lucide:shield-check",
    keywords: ["secure", "reliable", "trust", "quality", "proof"],
  },
  {
    title: "Download",
    icon: "lucide:download",
    keywords: ["download", "install", "cta", "conversion"],
  },
  {
    title: "Launch",
    icon: "lucide:rocket",
    keywords: ["launch", "growth", "start", "cta", "success"],
  },
];

const searchBlockDocsSchema = {
  type: "object",
  properties: {
    blockName: {
      type: "string",
      description: "The Blockish block name to search for, for example Container, Accordion, Rating, or Google Map.",
    },
    limit: {
      type: "number",
      description: "Maximum matching documents to return. Defaults to 3.",
    },
  },
  required: ["blockName"],
  additionalProperties: false,
} as const;

const suggestMissingBlockSchema = {
  type: "object",
  properties: {
    title: {
      type: "string",
      description: "Short name for the missing block, for example Feature Matrix.",
    },
    summary: {
      type: "string",
      description: "One-sentence summary of what the block should do.",
    },
    rationale: {
      type: "string",
      description: "Why this block would improve the design or reduce awkward composition.",
    },
    exampleUsage: {
      type: "string",
      description: "How the block would be used in this page or a future Blockish page.",
    },
    priority: {
      type: "string",
      enum: ["low", "medium", "high"],
      description: "How important this block feels for future Blockish capability.",
    },
    metadata: {
      type: "object",
      description: "Optional supporting details, such as section name or current workaround.",
      additionalProperties: true,
    },
  },
  required: ["title", "summary", "rationale"],
  additionalProperties: false,
} as const;

const searchDocsSchema = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "The documentation search query.",
    },
    limit: {
      type: "number",
      description: "Maximum matching documents to return. Defaults to 3.",
    },
  },
  required: ["query"],
  additionalProperties: false,
} as const;

const collectImageAssetsSchema = {
  type: "object",
  properties: {
    keywords: {
      type: "array",
      items: { type: "string" },
      description: "Search keywords for the page or section, such as WordPress plugin, gym, SaaS, restaurant, or ecommerce.",
    },
    section: {
      type: "string",
      description: "The section where the images will be used, for example hero, features, proof, or CTA.",
    },
    mood: {
      type: "string",
      description: "Desired visual mood, for example clean, premium, energetic, friendly, or technical.",
    },
    count: {
      type: "number",
      description: "Maximum image candidates to return. Defaults to 4.",
    },
  },
  required: ["keywords"],
  additionalProperties: false,
} as const;

const collectVideoAssetsSchema = {
  type: "object",
  properties: {
    keywords: {
      type: "array",
      items: { type: "string" },
      description: "Search keywords for finding video candidates.",
    },
    section: {
      type: "string",
      description: "The section where the video will be used, usually hero, proof, or feature demo.",
    },
    mood: {
      type: "string",
      description: "Desired video mood, for example energetic, clean, cinematic, product demo, or human.",
    },
    count: {
      type: "number",
      description: "Maximum video source candidates to return. Defaults to 3.",
    },
  },
  required: ["keywords"],
  additionalProperties: false,
} as const;

const collectIconAssetsSchema = {
  type: "object",
  properties: {
    keywords: {
      type: "array",
      items: { type: "string" },
      description: "Icon keywords for the page, features, benefits, CTAs, or blocks.",
    },
    style: {
      type: "string",
      description: "Desired icon style. Currently returns Iconify/Lucide line icons by default.",
    },
    section: {
      type: "string",
      description: "The section where the icons will be used, for example hero, features, or CTA.",
    },
    count: {
      type: "number",
      description: "Maximum icon candidates to return. Defaults to 6.",
    },
  },
  required: ["keywords"],
  additionalProperties: false,
} as const;

function truncateContent(content: string, maxLength = 5000) {
  if (content.length <= maxLength) {
    return content;
  }

  return `${content.slice(0, maxLength)}\n...[truncated]`;
}

function normalizeKeywords(keywords: unknown): string[] {
  if (!Array.isArray(keywords)) {
    return [];
  }

  return keywords
    .filter((keyword): keyword is string => typeof keyword === "string")
    .map((keyword) => keyword.trim().toLowerCase())
    .filter(Boolean);
}

function getToolLimit(value: unknown, defaultValue: number, maxValue: number) {
  return typeof value === "number"
    ? Math.max(1, Math.min(maxValue, Math.floor(value)))
    : defaultValue;
}

function getKeywordScore(assetKeywords: string[], keywords: string[]) {
  return assetKeywords.reduce((score, assetKeyword) => (
    keywords.some((keyword) => (
      keyword.includes(assetKeyword) || assetKeyword.includes(keyword)
    ))
      ? score + 1
      : score
  ), 0);
}

function toIconifySvgUrl(icon: string) {
  const [collection, name] = icon.split(":");

  return `https://api.iconify.design/${collection}/${name}.svg`;
}

function toSearchQuery(keywords: string[], fallback: string) {
  return encodeURIComponent(keywords.length ? keywords.join(" ") : fallback);
}

async function fetchIconSvg(icon: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    const response = await fetch(toIconifySvgUrl(icon), {
      signal: controller.signal,
    });

    if (!response.ok) {
      return "";
    }

    const svg = await response.text();

    return svg.trim().startsWith("<svg") ? svg.trim() : "";
  } catch (error) {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

export function collectImageAssets(input: CollectImageAssetsToolInput) {
  const keywords = normalizeKeywords(input.keywords);
  const limit = getToolLimit(input.count, 4, 6);
  const rankedAssets = imageAssetLibrary
    .map((asset) => ({
      asset,
      score: getKeywordScore(asset.keywords, keywords),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ asset }) => ({
      type: "image",
      title: asset.title,
      url: asset.url,
      sourceUrl: asset.sourceUrl,
      credit: asset.credit,
      suggestedUse: input.section || "website section",
      mood: input.mood || null,
    }));

  return {
    query: keywords,
    note: "Use these as visual candidates/placeholders. Final production assets should be reviewed for fit and licensing.",
    results: rankedAssets,
    moreSources: [
      `https://unsplash.com/s/photos/${toSearchQuery(keywords, "website")}`,
      `https://www.pexels.com/search/${toSearchQuery(keywords, "website")}/`,
    ],
  };
}

export function collectVideoAssets(input: CollectVideoAssetsToolInput) {
  const keywords = normalizeKeywords(input.keywords);
  const limit = getToolLimit(input.count, 3, 5);
  const query = toSearchQuery(keywords, "website product demo");
  const sources = [
    {
      type: "video",
      title: "Pexels video search",
      sourceUrl: `https://www.pexels.com/search/videos/${query}/`,
      suggestedUse: input.section || "hero or proof section",
    },
    {
      type: "video",
      title: "Coverr video search",
      sourceUrl: `https://coverr.co/search?q=${query}`,
      suggestedUse: input.section || "hero or proof section",
    },
    {
      type: "video",
      title: "Pixabay video search",
      sourceUrl: `https://pixabay.com/videos/search/${query}/`,
      suggestedUse: input.section || "hero or proof section",
    },
  ].slice(0, limit);

  return {
    query: keywords,
    mood: input.mood || null,
    note: "Video source candidates require manual selection or provider API keys for direct file URLs.",
    results: sources,
  };
}

export async function collectIconAssets(input: CollectIconAssetsToolInput) {
  const keywords = normalizeKeywords(input.keywords);
  const limit = getToolLimit(input.count, 6, 10);
  const rankedIcons = await Promise.all(iconAssetLibrary
    .map((asset) => ({
      asset,
      score: getKeywordScore(asset.keywords, keywords),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(async ({ asset }) => {
      const svgUrl = toIconifySvgUrl(asset.icon);

      return {
        type: "icon",
        title: asset.title,
        icon: asset.icon,
        format: "svg",
        svg: await fetchIconSvg(asset.icon),
        svgUrl,
        sourceUrl: `https://icon-sets.iconify.design/${asset.icon.replace(":", "/")}/`,
        style: input.style || "Lucide line icon",
      };
    }));

  return {
    query: keywords,
    note: "Blockish blocks accept SVG icons only. Use the svg field for block icon values. svgUrl/sourceUrl are references for review.",
    results: rankedIcons,
  };
}

export async function collectPageVisualAssets(brief: string) {
  const keywords = [brief];

  return {
    images: collectImageAssets({
      keywords,
      section: "full page",
      count: 4,
    }),
    videos: collectVideoAssets({
      keywords,
      section: "hero or proof section",
      count: 2,
    }),
    icons: await collectIconAssets({
      keywords,
      count: 6,
    }),
  };
}

export function createSearchBlockDocsTool() {
  return tool(
    async (input) => {
      const searchInput = input as SearchBlockDocsToolInput;
      const limit = typeof searchInput.limit === "number"
        ? Math.max(1, Math.min(5, Math.floor(searchInput.limit)))
        : 3;
      const docs = await getDocuments({
        search: searchInput.blockName,
        limit,
        orderBy: "updated_at",
        order: "desc",
      });

      if (!docs.length) {
        return `No Blockish documents found for block name: ${searchInput.blockName}.`;
      }

      return JSON.stringify({
        query: searchInput.blockName,
        results: docs.map((document) => ({
          source_id: document.source_id,
          title: document.title,
          category: document.category,
          metadata: document.metadata,
          content: truncateContent(document.content),
        })),
      });
    },
    {
      name: "search_block_docs",
      description: "Search Blockish documentation by block name and return matching docs for schema/implementation work.",
      schema: searchBlockDocsSchema,
    }
  );
}

export function createSearchDocsTool() {
  return tool(
    async (input) => {
      const searchInput = input as SearchDocsToolInput;
      const limit = typeof searchInput.limit === "number"
        ? Math.max(1, Math.min(5, Math.floor(searchInput.limit)))
        : 3;
      const docs = await getDocuments({
        search: searchInput.query,
        limit,
        orderBy: "updated_at",
        order: "desc",
      });

      if (!docs.length) {
        return `No Blockish documents found for query: ${searchInput.query}.`;
      }

      return JSON.stringify({
        query: searchInput.query,
        results: docs.map((document) => ({
          source_id: document.source_id,
          title: document.title,
          category: document.category,
          metadata: document.metadata,
          content: truncateContent(document.content, 8000),
        })),
      });
    },
    {
      name: "search_docs",
      description: "Search Blockish documentation by any query, including extension docs such as Class Manager.",
      schema: searchDocsSchema,
    }
  );
}

export function createCollectImageAssetsTool() {
  return tool(
    async (input) => {
      return JSON.stringify(collectImageAssets(
        input as CollectImageAssetsToolInput
      ));
    },
    {
      name: "collect_image_assets",
      description: "Collect image candidates and source links for a website/page section so the design guide includes real visual direction.",
      schema: collectImageAssetsSchema,
    }
  );
}

export function createCollectVideoAssetsTool() {
  return tool(
    async (input) => {
      return JSON.stringify(collectVideoAssets(
        input as CollectVideoAssetsToolInput
      ));
    },
    {
      name: "collect_video_assets",
      description: "Collect stock video source searches for a website/page section when motion would improve the design.",
      schema: collectVideoAssetsSchema,
    }
  );
}

export function createCollectIconAssetsTool() {
  return tool(
    async (input) => {
      return JSON.stringify(await collectIconAssets(
        input as CollectIconAssetsToolInput
      ));
    },
    {
      name: "collect_icon_assets",
      description: "Collect SVG icon candidates for Blockish icon fields, feature cards, benefit lists, CTAs, and visual navigation.",
      schema: collectIconAssetsSchema,
    }
  );
}

export function createSuggestMissingBlockTool() {
  return tool(
    async (input) => {
      const suggestionInput = input as SuggestMissingBlockToolInput;
      const suggestion = await upsertBlockSuggestion({
        title: suggestionInput.title,
        summary: suggestionInput.summary,
        rationale: suggestionInput.rationale,
        exampleUsage: suggestionInput.exampleUsage,
        priority: suggestionInput.priority,
        metadata: suggestionInput.metadata,
        sourceAgent: "designer",
      });

      return [
        `Saved block suggestion: ${suggestion.title}.`,
        `Priority: ${suggestion.priority}.`,
        `Mention count: ${suggestion.mention_count}.`,
      ].join(" ");
    },
    {
      name: "suggest_missing_block",
      description: "Save a future Blockish block suggestion when an absent block would materially improve a design.",
      schema: suggestMissingBlockSchema,
    }
  );
}
