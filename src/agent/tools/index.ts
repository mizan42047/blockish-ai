import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { tool } from "langchain";
import { config } from "config.js";
import { getBlockishOverviewContext } from "agent/context/document-context.js";
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

type AskUserToolInput = {
  allowCustom?: boolean;
  answer?: string;
  interactionType?: "multi_choice" | "single_choice" | "text" | "yes_no";
  options?: { label: string; value: string }[];
  question: string;
};

type ReadBlockishOverviewToolInput = {
  cursor?: number;
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


type FontAwesomeIcon = {
  label: string;
  search: { terms: string[] };
  styles: string[];
  svg: Record<string, { raw: string }>;
  free: string[];
};

const FA_ICONS_URL = "https://raw.githubusercontent.com/FortAwesome/Font-Awesome/refs/heads/7.x/metadata/icons.json";
const FA_CACHE_PATH = join(process.cwd(), ".cache", "fa-icons.json");
const FA_STYLE_PREFERENCE = ["solid", "regular", "brands", "thin", "light"];
const BLOCKISH_OVERVIEW_CHUNK_SIZE = 3500;
const BLOCKISH_OVERVIEW_CHUNK_OVERLAP = 200;

const blockishOverviewTextSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: BLOCKISH_OVERVIEW_CHUNK_SIZE,
  chunkOverlap: BLOCKISH_OVERVIEW_CHUNK_OVERLAP,
});

let faIconsCache: Record<string, FontAwesomeIcon> | null = null;

async function loadFontAwesomeIcons(): Promise<Record<string, FontAwesomeIcon>> {
  if (faIconsCache) return faIconsCache;

  try {
    const cached = await readFile(FA_CACHE_PATH, "utf-8");
    faIconsCache = JSON.parse(cached) as Record<string, FontAwesomeIcon>;
    return faIconsCache;
  } catch {
    // cache miss — fall through to network fetch
  }

  const response = await fetch(FA_ICONS_URL);
  faIconsCache = await response.json() as Record<string, FontAwesomeIcon>;

  mkdir(join(process.cwd(), ".cache"), { recursive: true })
    .then(() => writeFile(FA_CACHE_PATH, JSON.stringify(faIconsCache), "utf-8"))
    .catch(() => {});

  return faIconsCache;
}

function getFaIconSvg(icon: FontAwesomeIcon): { svg: string; style: string } {
  const style = FA_STYLE_PREFERENCE.find((s) => icon.svg[s]?.raw) ?? icon.styles[0] ?? "solid";
  return { svg: icon.svg[style]?.raw ?? "", style };
}

function buildFallbackImages(keywords: string[], count: number) {
  const seed = keywords.join("-") || "website";
  return Array.from({ length: count }, (_, i) => ({
    type: "image",
    title: `${seed} placeholder ${i + 1}`,
    url: `https://picsum.photos/seed/${seed}-${i}/1600/900`,
    sourceUrl: "https://picsum.photos",
    credit: "picsum.photos",
    suggestedUse: "website section",
    mood: null as string | null,
  }));
}


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

const askUserSchema = {
  type: "object",
  properties: {
    question: {
      type: "string",
      description: "The single focused question to ask the user.",
    },
    interactionType: {
      type: "string",
      enum: ["single_choice", "multi_choice", "yes_no", "text"],
      description: "The kind of UI control the frontend should render.",
    },
    options: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          value: { type: "string" },
        },
        required: ["label", "value"],
        additionalProperties: false,
      },
      description: "Choice options for single_choice, multi_choice, or yes_no interactions.",
    },
    allowCustom: {
      type: "boolean",
      description: "Whether the user can type a custom answer.",
    },
    answer: {
      type: "string",
      description: "Human answer supplied when the interrupted ask_user tool is resumed.",
    },
  },
  required: ["question"],
  additionalProperties: false,
} as const;

const readBlockishOverviewSchema = {
  type: "object",
  properties: {
    cursor: {
      type: "number",
      description: "Chunk cursor returned by the previous call. Omit this for the first overview chunk.",
    },
  },
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

function getChunkCursor(value: unknown, chunkCount: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(Math.max(0, chunkCount - 1), Math.floor(value)));
}

async function splitTextIntoChunks(content: string) {
  return blockishOverviewTextSplitter.splitText(content);
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

function toSearchQuery(keywords: string[], fallback: string) {
  return encodeURIComponent(keywords.length ? keywords.join(" ") : fallback);
}

type PexelsPhoto = {
  alt: string | null;
  photographer: string;
  url: string;
  src: { large: string };
};

async function searchPexelsImages(query: string, count: number, apiKey: string) {
  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", String(count));
  url.searchParams.set("orientation", "landscape");

  const response = await fetch(url.toString(), {
    headers: { Authorization: apiKey },
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) return null;

  const data = await response.json() as { photos: PexelsPhoto[] };

  return data.photos.map((photo) => ({
    type: "image",
    title: photo.alt ?? query,
    url: photo.src.large,
    sourceUrl: photo.url,
    credit: `Photo by ${photo.photographer} on Pexels`,
    suggestedUse: "",
    mood: null as string | null,
  }));
}

export async function collectImageAssets(input: CollectImageAssetsToolInput) {
  const keywords = normalizeKeywords(input.keywords);
  const limit = getToolLimit(input.count, 4, 6);
  const query = keywords.length ? keywords.join(" ") : "website";

  if (config.pexelsApiKey) {
    const photos = await searchPexelsImages(query, limit, config.pexelsApiKey).catch(() => null);

    if (photos?.length) {
      return {
        query: keywords,
        note: "Real Pexels images. Review licensing before production use.",
        results: photos.map((p) => ({
          ...p,
          suggestedUse: input.section || "website section",
          mood: input.mood || null,
        })),
      };
    }
  }

  const fallbackImages = buildFallbackImages(keywords, limit).map((img) => ({
    ...img,
    suggestedUse: input.section || "website section",
    mood: input.mood || null,
  }));

  return {
    query: keywords,
    note: "Fallback placeholders from picsum.photos. Add PEXELS_API_KEY for real contextual images.",
    results: fallbackImages,
    placeholder: `https://placehold.co/1600x900/png`,
  };
}

type PexelsVideo = {
  url: string;
  width: number;
  height: number;
  user: { name: string; url: string };
  video_files: { link: string; quality: string; file_type: string }[];
};

async function searchPexelsVideos(query: string, count: number, apiKey: string) {
  const url = new URL("https://api.pexels.com/videos/search");
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", String(count));
  url.searchParams.set("orientation", "landscape");

  const response = await fetch(url.toString(), {
    headers: { Authorization: apiKey },
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) return null;

  const data = await response.json() as { videos: PexelsVideo[] };

  return data.videos.map((video) => {
    const file = video.video_files.find((f) => f.quality === "hd" && f.file_type === "video/mp4")
      ?? video.video_files.find((f) => f.file_type === "video/mp4")
      ?? video.video_files[0];

    return {
      type: "video",
      title: `Pexels video by ${video.user.name}`,
      url: file?.link ?? "",
      sourceUrl: `${video.url}`,
      credit: `Video by ${video.user.name} on Pexels`,
      suggestedUse: "",
      mood: null as string | null,
    };
  });
}

export async function collectVideoAssets(input: CollectVideoAssetsToolInput) {
  const keywords = normalizeKeywords(input.keywords);
  const limit = getToolLimit(input.count, 3, 5);
  const query = keywords.length ? keywords.join(" ") : "website product demo";

  if (config.pexelsApiKey) {
    const videos = await searchPexelsVideos(query, limit, config.pexelsApiKey).catch(() => null);

    if (videos?.length) {
      return {
        query: keywords,
        mood: input.mood || null,
        note: "Real Pexels videos. Review licensing before production use.",
        results: videos.map((v) => ({
          ...v,
          suggestedUse: input.section || "hero or proof section",
          mood: input.mood || null,
        })),
      };
    }
  }

  const fallbackQuery = toSearchQuery(keywords, "website product demo");
  return {
    query: keywords,
    mood: input.mood || null,
    note: "Fallback search links. Add PEXELS_API_KEY for real video URLs.",
    results: [
      { type: "video", title: "Pexels video search", sourceUrl: `https://www.pexels.com/search/videos/${fallbackQuery}/`, suggestedUse: input.section || "hero or proof section" },
      { type: "video", title: "Coverr video search", sourceUrl: `https://coverr.co/search?q=${fallbackQuery}`, suggestedUse: input.section || "hero or proof section" },
      { type: "video", title: "Pixabay video search", sourceUrl: `https://pixabay.com/videos/search/${fallbackQuery}/`, suggestedUse: input.section || "hero or proof section" },
    ].slice(0, limit),
  };
}

export async function collectIconAssets(input: CollectIconAssetsToolInput) {
  const keywords = normalizeKeywords(input.keywords);
  const limit = getToolLimit(input.count, 6, 10);
  const faIcons = await loadFontAwesomeIcons();

  const rankedIcons = Object.entries(faIcons)
    .map(([name, icon]) => ({
      name,
      icon,
      score: getKeywordScore([name, ...icon.search.terms], keywords),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ name, icon }) => {
      const { svg, style } = getFaIconSvg(icon);
      return {
        type: "icon",
        title: icon.label,
        icon: `fa-${style}:${name}`,
        format: "svg",
        svg,
        sourceUrl: `https://fontawesome.com/icons/${name}`,
        style: input.style || style,
      };
    });

  return {
    query: keywords,
    note: "Blockish blocks accept SVG icons only. Use the svg field for block icon values.",
    results: rankedIcons,
  };
}

export async function collectPageVisualAssets(brief: string) {
  const keywords = [brief];

  return {
    images: await collectImageAssets({
      keywords,
      section: "full page",
      count: 4,
    }),
    videos: await collectVideoAssets({
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

export function createAskUserTool() {
  return tool(
    async (input) => {
      const askInput = input as AskUserToolInput;

      if (typeof askInput.answer === "string" && askInput.answer.trim()) {
        return `User answered: ${askInput.answer.trim()}`;
      }

      return JSON.stringify({
        question: askInput.question,
        interactionType: askInput.interactionType ?? "text",
        options: askInput.options ?? [],
        allowCustom: askInput.allowCustom ?? true,
      });
    },
    {
      name: "ask_user",
      description: "Ask the user one focused question when required information is missing. This tool is paused for human input by HITL middleware.",
      schema: askUserSchema,
    }
  );
}

export function createReadBlockishOverviewTool() {
  return tool(
    async (input) => {
      const overview = await getBlockishOverviewContext();
      const trimmedOverview = overview.trim();

      if (!trimmedOverview) {
        return "No Blockish overview document was found in the database.";
      }

      const chunks = await splitTextIntoChunks(trimmedOverview);

      if (!chunks.length) {
        return "No Blockish overview document content was available after chunking.";
      }

      const readInput = input as ReadBlockishOverviewToolInput;
      const cursor = getChunkCursor(readInput.cursor, chunks.length);
      const nextCursor = cursor + 1 < chunks.length ? cursor + 1 : null;

      return JSON.stringify({
        documentTitle: "index",
        cursor,
        nextCursor,
        hasMore: nextCursor !== null,
        instruction: nextCursor === null
          ? "This is the last overview chunk."
          : "If this chunk answers the question, stop reading. Only call this tool again with nextCursor when the answer is still missing.",
        content: chunks[cursor],
      });
    },
    {
      name: "read_blockish_overview",
      description: "Read the Blockish plugin overview document in chunks. Start without a cursor, then continue with nextCursor only if the previous chunk was not enough.",
      schema: readBlockishOverviewSchema,
    }
  );
}

export function createCollectImageAssetsTool() {
  return tool(
    async (input) => {
      return JSON.stringify(await collectImageAssets(
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
      return JSON.stringify(await collectVideoAssets(
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
