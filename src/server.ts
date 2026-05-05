import express from "express";
import cors from "cors";
import pool from "db.js";
import morgan from "morgan";
import helmet from "helmet";
import {
  deleteBatchDocuments,
  deleteDocument,
  getDocumentBySourceId,
  getDocuments,
  upsertDocument,
  upsertDocumentsBatch,
} from "routes/document.ropository.js";
import { deleteOption, upsertOption } from "routes/options.repository.js";
import { assistantCallback } from "routes/assistant.routes.js";

type DocumentInputPayload = {
  source_id: string;
  title: string;
  content: string;
  category: string;
  metadata?: any;
  embedding?: number[] | null;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseCsv(value: unknown): string[] | undefined {
  if (!isNonEmptyString(value)) return undefined;
  const items = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length ? items : undefined;
}

function parseNumber(value: unknown): number | undefined {
  if (!isNonEmptyString(value)) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseDate(value: unknown): Date | undefined {
  if (!isNonEmptyString(value)) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function createServer() {
  const app = express();

  app.use(express.json());
  app.use(cors({ origin: "*" }));
  app.use(morgan("dev"));
  app.use(helmet());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/test-db", async (req, res) => {
    try {
      const result = await pool.query("SELECT * FROM documents");
      res.json({
        ok: true,
        data: result.rows,
      });
    } catch (error) {
      res.status(500).json({ error: "Table not found" });
    }
  });

  app.post("/assistant", assistantCallback);

  app.get("/documents", async (req, res) => {
    try {
      const docs = await getDocuments({
        category: isNonEmptyString(req.query.category)
          ? req.query.category
          : undefined,
        sourceIds: parseCsv(req.query.sourceIds),
        search: isNonEmptyString(req.query.search) ? req.query.search : undefined,
        updatedAfter: parseDate(req.query.updatedAfter),
        updatedBefore: parseDate(req.query.updatedBefore),
        limit: parseNumber(req.query.limit),
        offset: parseNumber(req.query.offset),
        orderBy:
          req.query.orderBy === "created_at" || req.query.orderBy === "updated_at"
            ? req.query.orderBy
            : undefined,
        order:
          req.query.order === "asc" || req.query.order === "desc"
            ? req.query.order
            : undefined,
      });

      res.json({ ok: true, data: docs });
    } catch (error) {
      res.status(500).json({ ok: false, error: "Failed to fetch documents" });
    }
  });

  app.get("/documents/:sourceId", async (req, res) => {
    try {
      const doc = await getDocumentBySourceId(req.params.sourceId);
      if (!doc) return res.status(404).json({ ok: false, error: "Not found" });
      res.json({ ok: true, data: doc });
    } catch (error) {
      res.status(500).json({ ok: false, error: "Failed to fetch document" });
    }
  });

  app.post("/documents", async (req, res) => {
    try {
      const { source_id, title, content, category, metadata, embedding } =
        req.body ?? {};

      if (!isNonEmptyString(source_id)) {
        return res
          .status(400)
          .json({ ok: false, error: "source_id is required" });
      }

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
      const finalMetadata = Object.prototype.hasOwnProperty.call(body, "metadata")
        ? metadata
        : existing?.metadata ?? {};
      const finalEmbedding = Object.prototype.hasOwnProperty.call(body, "embedding")
        ? embedding
        : existing?.embedding ?? null;

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
  });

  app.post("/documents/batch", async (req, res) => {
    try {
      const docs = Array.isArray(req.body) ? req.body : req.body?.documents;
      if (!Array.isArray(docs)) {
        return res
          .status(400)
          .json({ ok: false, error: "Expected an array of documents" });
      }

      const sourceIds = docs
        .map((d) => d?.source_id)
        .filter(isNonEmptyString) as string[];

      if (sourceIds.length !== docs.length) {
        return res
          .status(400)
          .json({ ok: false, error: "Each document must include source_id" });
      }

      const existingDocs = await getDocuments({ sourceIds: [...new Set(sourceIds)] });
      const existingBySourceId = new Map(
        existingDocs.map((d) => [d.source_id, d] as const)
      );

      type NormalizedOk = { ok: true; data: DocumentInputPayload };
      type NormalizedErr = { ok: false; source_id: string; error: string };

      const normalizedDocs: Array<NormalizedOk | NormalizedErr> = docs.map((doc) => {
        const {
          source_id,
          title,
          content,
          category,
          metadata,
          embedding,
        } = doc ?? {};

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
        const finalCategory = isNonEmptyString(category)
          ? category
          : existing.category;
        const finalMetadata = Object.prototype.hasOwnProperty.call(doc, "metadata")
          ? metadata
          : existing.metadata ?? {};
        const finalEmbedding = Object.prototype.hasOwnProperty.call(doc, "embedding")
          ? embedding
          : existing.embedding ?? null;

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

      const errors = normalizedDocs.filter((d) => !d.ok);
      if (errors.length) {
        return res.status(400).json({
          ok: false,
          error: "Invalid documents in batch",
          details: errors.map((e) => ({ source_id: e.source_id, error: e.error })),
        });
      }

      const okDocs = normalizedDocs.filter((d): d is NormalizedOk => d.ok);
      const rows = await upsertDocumentsBatch(
        okDocs.map((d) => d.data)
      );
      res.json({ ok: true, data: rows });
    } catch (error) {
      res
        .status(500)
        .json({ ok: false, error: "Failed to upsert documents batch" });
    }
  });

  app.delete("/documents/:sourceId", async (req, res) => {
    try {
      const deleted = await deleteDocument(req.params.sourceId);
      if (!deleted)
        return res.status(404).json({ ok: false, error: "Not found" });
      res.json({ ok: true, data: deleted });
    } catch (error) {
      res.status(500).json({ ok: false, error: "Failed to delete document" });
    }
  });

  app.delete("/documents/batch", async (req, res) => {
    try {
      const sourceIds = Array.isArray(req.body)
        ? req.body
        : req.body?.sourceIds;
      if (!Array.isArray(sourceIds)) {
        return res
          .status(400)
          .json({ ok: false, error: "Expected sourceIds: string[]" });
      }

      const deleted = await deleteBatchDocuments(sourceIds);
      res.json({ ok: true, data: deleted });
    } catch (error) {
      res
        .status(500)
        .json({ ok: false, error: "Failed to delete documents batch" });
    }
  });

  app.put("/options/:optionKey", async (req, res) => {
    try {
      const option_key = req.params.optionKey;
      const option_value =
        req.body?.option_value !== undefined ? req.body.option_value : req.body?.value;

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
  });

  app.delete("/options/:optionKey", async (req, res) => {
    try {
      const deleted = await deleteOption(req.params.optionKey);
      if (!deleted)
        return res.status(404).json({ ok: false, error: "Not found" });
      res.json({ ok: true, data: deleted });
    } catch (error) {
      res.status(500).json({ ok: false, error: "Failed to delete option" });
    }
  });

  return app;
}
