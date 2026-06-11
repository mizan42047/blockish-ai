import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import pool from "db.js";
import morgan from "morgan";
import helmet from "helmet";
import {
  deleteBatchDocuments,
  deleteDocument,
  getDocumentBySourceId,
  getDocuments,
  type GetDocumentsOptions,
  upsertDocument,
  upsertDocumentsBatch,
} from "routes/document.ropository.js";
import { deleteOption, upsertOption } from "routes/options.repository.js";
import {
  getBlockSuggestions,
  type GetBlockSuggestionsOptions,
} from "routes/block-suggestions.repository.js";
import {
  requireDocumentSourceId,
  requireDocumentsPayload,
  requireSourceIdsPayload,
} from "middlewares/document.middleware.js";
import type {
  GetDocumentsQuery,
  GetBlockSuggestionsQuery,
  NormalizedDocument,
  NormalizedDocumentOk,
} from "types.js";
import { isNonEmptyString, parseDate, parseNumber } from "utils.js";
import developerCallbacks from "assistant/callbacks/developer.callbacks.js";
import productManagerAgent from "assistant/agents/product-manager.js";

class AppServer {
  private readonly app: Express;

  constructor() {
    this.app = express();
    this.registerMiddleware();
    this.registerRoutes();
  }

  public getApp() {
    return this.app;
  }

  private registerMiddleware() {
    this.app.use(express.json({ limit: "8mb" }));
    this.app.use(cors({ origin: "*" }));
    this.app.use(morgan("dev"));
    this.app.use(helmet());
  }

  private registerRoutes() {
    this.app.get("/health", this.healthCallback);
    this.app.get("/test-db", this.testDbCallback);
    this.app.get("/block-suggestions", this.getBlockSuggestionsCallback);
    this.app.get("/documents", this.getDocumentsCallback);
    this.app.get("/documents/:sourceId", this.getDocumentCallback);

    this.app.post("/documents", requireDocumentSourceId, this.upsertDocumentCallback);
    this.app.post("/documents/batch", requireDocumentsPayload, this.upsertDocumentsBatchCallback);
    this.app.post("/developer", developerCallbacks);
    this.app.post("/product-manager", this.productManagerCallback);

    this.app.delete("/documents/:sourceId", this.deleteDocumentCallback);
    this.app.delete("/documents/batch", requireSourceIdsPayload, this.deleteDocumentsBatchCallback);
    this.app.put("/options/:optionKey", this.upsertOptionCallback);
    this.app.delete("/options/:optionKey", this.deleteOptionCallback);
  }

  private healthCallback = (_req: Request, res: Response) => {
    res.json({ ok: true });
  };

  private testDbCallback = async (_req: Request, res: Response) => {
    try {
      const result = await pool.query("SELECT * FROM documents");
      res.json({
        ok: true,
        data: result.rows,
      });
    } catch (error) {
      res.status(500).json({ error: "Table not found" });
    }
  };

  private getDocumentsCallback = async (
    req: Request<{}, unknown, unknown, GetDocumentsQuery>,
    res: Response
  ) => {
    try {
      const query = req.query;

      const getDocumentsOptions: GetDocumentsOptions = {
        category: query.category,
        sourceIds: query.sourceIds,
        search: query.search,
        onlySearchTitle: query.onlySearchTitle === "true",
        updatedAfter: parseDate(query.updatedAfter),
        updatedBefore: parseDate(query.updatedBefore),
        limit: parseNumber(query.limit),
        offset: parseNumber(query.offset),
        orderBy: query.orderBy === "created_at" || query.orderBy === "updated_at"
          ? query.orderBy
          : undefined,
        order: query.order === "asc" || query.order === "desc"
          ? query.order
          : undefined,
      };

      const docs = await getDocuments(getDocumentsOptions);

      res.json({ ok: true, data: docs });
    } catch (error) {
      res.status(500).json({ ok: false, error: "Failed to fetch documents" });
    }
  };

  private getBlockSuggestionsCallback = async (
    req: Request<{}, unknown, unknown, GetBlockSuggestionsQuery>,
    res: Response
  ) => {
    try {
      const query = req.query;
      const options: GetBlockSuggestionsOptions = {
        limit: parseNumber(query.limit),
        offset: parseNumber(query.offset),
        order: query.order === "asc" || query.order === "desc"
          ? query.order
          : undefined,
        orderBy:
          query.orderBy === "mention_count" ||
            query.orderBy === "updated_at" ||
            query.orderBy === "created_at"
            ? query.orderBy
            : undefined,
        priority: query.priority,
        search: query.search,
        sourceAgent: query.sourceAgent,
      };

      const suggestions = await getBlockSuggestions(options);

      res.json({ ok: true, data: suggestions });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: "Failed to fetch block suggestions",
      });
    }
  };

  private getDocumentCallback = async (
    req: Request<{ sourceId: string }>,
    res: Response
  ) => {
    try {
      const doc = await getDocumentBySourceId(Number(req.params.sourceId));
      if (!doc) return res.status(404).json({ ok: false, error: "Not found" });
      res.json({ ok: true, data: doc });
    } catch (error) {
      res.status(500).json({ ok: false, error: "Failed to fetch document" });
    }
  };

  private upsertDocumentCallback = async (req: Request, res: Response) => {
    try {
      const {
        source_id: sourceId,
        title,
        content,
        category,
        metadata,
        embedding,
      } = req.body ?? {};

      const source_id = Number(sourceId);
      const existing = await getDocumentBySourceId(source_id);
      const isCreate = !existing;

      if (isCreate) {
        if (
          !isNonEmptyString(title) ||
          !isNonEmptyString(content) ||
          !isNonEmptyString(category)
        ) {
          return res.status(400).json({
            ok: false,
            error: "title, content, category are required when creating",
          });
        }
      } else {
        if (typeof title !== "undefined" && !isNonEmptyString(title)) {
          return res
            .status(400)
            .json({ ok: false, error: "title must be a non-empty string" });
        }
        if (typeof content !== "undefined" && !isNonEmptyString(content)) {
          return res
            .status(400)
            .json({ ok: false, error: "content must be a non-empty string" });
        }
        if (typeof category !== "undefined" && !isNonEmptyString(category)) {
          return res
            .status(400)
            .json({ ok: false, error: "category must be a non-empty string" });
        }

        const body = req.body ?? {};
        const hasAnyUpdates =
          typeof title !== "undefined" ||
          typeof content !== "undefined" ||
          typeof category !== "undefined" ||
          Object.prototype.hasOwnProperty.call(body, "metadata") ||
          Object.prototype.hasOwnProperty.call(body, "embedding");

        if (!hasAnyUpdates) {
          return res
            .status(400)
            .json({ ok: false, error: "No fields provided to update" });
        }
      }

      const body = req.body ?? {};
      const finalTitle = isNonEmptyString(title) ? title : existing?.title;
      const finalContent = isNonEmptyString(content) ? content : existing?.content;
      const finalCategory = isNonEmptyString(category) ? category : existing?.category;
      const finalMetadata = Object.prototype.hasOwnProperty.call(body, "metadata") ? metadata : existing?.metadata ?? {};
      const finalEmbedding = Object.prototype.hasOwnProperty.call(body, "embedding") ? embedding : existing?.embedding ?? null;

      if (
        !isNonEmptyString(finalTitle) ||
        !isNonEmptyString(finalContent) ||
        !isNonEmptyString(finalCategory)
      ) {
        return res.status(400).json({
          ok: false,
          error: "title, content, category are required",
        });
      }

      const doc = await upsertDocument({
        source_id,
        title: finalTitle,
        content: finalContent,
        category: finalCategory,
        metadata: finalMetadata,
        embedding: finalEmbedding,
      });

      res.json({ ok: true, data: doc });
    } catch (error) {
      res.status(500).json({ ok: false, error: "Failed to upsert document" });
    }
  };

  private upsertDocumentsBatchCallback = async (req: Request, res: Response) => {
    try {
      const docs = (Array.isArray(req.body) ? req.body : req.body?.documents) as Array<Record<string, any>>;
      const sourceIds = docs.map((document) => Number(document.source_id));

      const existingDocs = await getDocuments({ sourceIds: [...new Set(sourceIds)] });
      const existingBySourceId = new Map(
        existingDocs.map((document) => [document.source_id, document] as const)
      );

      const normalizedDocs: NormalizedDocument[] = docs.map((doc) => {
        const { title, content, category, metadata, embedding } = doc ?? {};
        const source_id = Number(doc.source_id);

        const existing = existingBySourceId.get(source_id);
        const isCreate = !existing;

        if (isCreate) {
          if (
            !isNonEmptyString(title) ||
            !isNonEmptyString(content) ||
            !isNonEmptyString(category)
          ) {
            return {
              ok: false as const,
              source_id,
              error: "title, content, category are required when creating",
            };
          }

          return {
            ok: true as const,
            data: {
              source_id,
              title,
              content,
              category,
              metadata,
              embedding,
            },
          };
        }

        if (typeof title !== "undefined" && !isNonEmptyString(title)) {
          return {
            ok: false as const,
            source_id,
            error: "title must be a non-empty string",
          };
        }
        if (typeof content !== "undefined" && !isNonEmptyString(content)) {
          return {
            ok: false as const,
            source_id,
            error: "content must be a non-empty string",
          };
        }
        if (typeof category !== "undefined" && !isNonEmptyString(category)) {
          return {
            ok: false as const,
            source_id,
            error: "category must be a non-empty string",
          };
        }

        const finalTitle = isNonEmptyString(title) ? title : existing.title;
        const finalContent = isNonEmptyString(content) ? content : existing.content;
        const finalCategory = isNonEmptyString(category) ? category : existing.category;
        const finalMetadata = Object.prototype.hasOwnProperty.call(doc, "metadata") ? metadata : existing.metadata ?? {};
        const finalEmbedding = Object.prototype.hasOwnProperty.call(doc, "embedding") ? embedding : existing.embedding ?? null;

        return {
          ok: true as const,
          data: {
            source_id,
            title: finalTitle,
            content: finalContent,
            category: finalCategory,
            metadata: finalMetadata,
            embedding: finalEmbedding,
          },
        };
      });

      const errors = normalizedDocs.filter((document) => !document.ok);
      if (errors.length) {
        return res.status(400).json({
          ok: false,
          error: "Invalid documents in batch",
          details: errors.map((error) => ({ source_id: error.source_id, error: error.error })),
        });
      }

      const okDocs = normalizedDocs.filter(
        (document): document is NormalizedDocumentOk => document.ok
      );
      const rows = await upsertDocumentsBatch(okDocs.map((document) => document.data));
      res.json({ ok: true, data: rows });
    } catch (error) {
      res
        .status(500)
        .json({ ok: false, error: "Failed to upsert documents batch" });
    }
  };

  private deleteDocumentCallback = async (
    req: Request<{ sourceId: string }>,
    res: Response
  ) => {
    try {
      const deleted = await deleteDocument(Number(req.params.sourceId));
      if (!deleted)
        return res.status(404).json({ ok: false, error: "Not found" });
      res.json({ ok: true, data: deleted });
    } catch (error) {
      res.status(500).json({ ok: false, error: "Failed to delete document" });
    }
  };

  private deleteDocumentsBatchCallback = async (req: Request, res: Response) => {
    try {
      const sourceIds = (Array.isArray(req.body) ? req.body : req.body?.sourceIds) as number[];
      const deleted = await deleteBatchDocuments(sourceIds.map(Number));
      res.json({ ok: true, data: deleted });
    } catch (error) {
      res
        .status(500)
        .json({ ok: false, error: "Failed to delete documents batch" });
    }
  };

  private upsertOptionCallback = async (
    req: Request<{ optionKey: string }>,
    res: Response
  ) => {
    try {
      const option_key = req.params.optionKey;
      const option_value = req.body?.option_value !== undefined ? req.body.option_value : req.body?.value;

      if (!isNonEmptyString(option_key)) {
        return res
          .status(400)
          .json({ ok: false, error: "optionKey is required" });
      }
      if (option_value === undefined) {
        return res
          .status(400)
          .json({ ok: false, error: "option_value is required" });
      }

      const row = await upsertOption({ option_key, option_value });
      res.json({ ok: true, data: row });
    } catch (error) {
      res.status(500).json({ ok: false, error: "Failed to upsert option" });
    }
  };

  private productManagerCallback = async (req: Request, res: Response) => {
    try {
      const { message, answers } = req.body ?? {};
      if (!message) return res.status(400).json({ ok: false, error: "message is required" });
      const result = await productManagerAgent().runHttp(message, answers ?? []);
      res.json({ ok: true, data: result });
    } catch (error) {
      console.error("[product-manager]", error);
      res.status(500).json({ ok: false, error: "Failed to run product manager" });
    }
  };

  private deleteOptionCallback = async (
    req: Request<{ optionKey: string }>,
    res: Response
  ) => {
    try {
      const deleted = await deleteOption(req.params.optionKey);
      if (!deleted)
        return res.status(404).json({ ok: false, error: "Not found" });
      res.json({ ok: true, data: deleted });
    } catch (error) {
      res.status(500).json({ ok: false, error: "Failed to delete option" });
    }
  };
}

export function createServer() {
  return new AppServer().getApp();
}
