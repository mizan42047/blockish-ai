import type { RequestHandler } from "express";

export const requireDocumentSourceId: RequestHandler = (req, res, next) => {
  if (req.body?.source_id === undefined) {
    return res.status(400).json({ ok: false, error: "source_id is required" });
  }

  next();
};

export const requireDocumentsPayload: RequestHandler = (req, res, next) => {
  const docs = Array.isArray(req.body) ? req.body : req.body?.documents;

  if (!Array.isArray(docs)) {
    return res.status(400).json({ ok: false, error: "Expected an array of documents" });
  }

  next();
};

export const requireSourceIdsPayload: RequestHandler = (req, res, next) => {
  const sourceIds = Array.isArray(req.body) ? req.body : req.body?.sourceIds;

  if (!Array.isArray(sourceIds)) {
    return res.status(400).json({ ok: false, error: "Expected sourceIds: number[]" });
  }

  next();
};
