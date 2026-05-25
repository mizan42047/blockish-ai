import pool from "db.js";

type DocumentInput = {
  source_id: number;
  title: string;
  content: string;
  category: string;
  metadata?: any;
  embedding?: number[] | null;
};

type DocumentRow = {
  id: number;
  source_id: number;
  title: string;
  content: string;
  category: string;
  metadata: any;
  embedding: number[] | null;
  created_at: Date;
  updated_at: Date;
};

export type GetDocumentsOptions = {
  category?: string;
  sourceIds?: number[];
  search?: string;
  onlySearchTitle?: boolean;
  updatedAfter?: Date;
  updatedBefore?: Date;
  limit?: number;
  offset?: number;
  orderBy?: "updated_at" | "created_at";
  order?: "asc" | "desc";
};

export async function upsertDocument(data: DocumentInput) {
  const result = await pool.query(
    `
    INSERT INTO documents (source_id, title, content, category, metadata, embedding)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (source_id)
    DO UPDATE SET
      title = EXCLUDED.title,
      content = EXCLUDED.content,
      category = EXCLUDED.category,
      metadata = EXCLUDED.metadata,
      embedding = EXCLUDED.embedding,
      updated_at = NOW()
    RETURNING *;
    `,
    [
      data.source_id,
      data.title,
      data.content,
      data.category,
      data.metadata ?? {},
      data.embedding ?? null,
    ]
  );

  return result.rows[0];
}

export async function upsertDocumentsBatch(docs: DocumentInput[]) {
  if (!docs.length) return [];

  const values: any[] = [];
  const placeholders: string[] = [];

  docs.forEach((doc, index) => {
    const base = index * 6;

    placeholders.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`
    );

    values.push(
      doc.source_id,
      doc.title,
      doc.content,
      doc.category,
      doc.metadata ?? {},
      doc.embedding ?? null
    );
  });

  const query = `
    INSERT INTO documents (source_id, title, content, category, metadata, embedding)
    VALUES ${placeholders.join(", ")}
    ON CONFLICT (source_id)
    DO UPDATE SET
      title = EXCLUDED.title,
      content = EXCLUDED.content,
      category = EXCLUDED.category,
      metadata = EXCLUDED.metadata,
      embedding = EXCLUDED.embedding,
      updated_at = NOW()
    RETURNING *;
  `;

  const result = await pool.query(query, values);

  return result.rows;
}

export async function getDocuments(
  options: GetDocumentsOptions = {}
): Promise<DocumentRow[]> {
  const where: string[] = [];
  const values: any[] = [];

  const addWhere = (clause: string, value?: any) => {
    if (typeof value === "undefined") return;
    values.push(value);
    where.push(clause.replace("?", `$${values.length}`));
  };

  addWhere("category = ?", options.category);

  if (options.sourceIds?.length) {
    values.push(options.sourceIds);
    where.push(`source_id = ANY($${values.length})`);
  }

  if (options.search?.trim()) {
    values.push(`%${options.search.trim()}%`);
    const p = `$${values.length}`;

    where.push(
      options.onlySearchTitle === true
        ? `title ILIKE ${p}`
        : `(title ILIKE ${p} OR content ILIKE ${p})`
    );
  }

  addWhere("updated_at >= ?", options.updatedAfter);
  addWhere("updated_at <= ?", options.updatedBefore);

  const orderBy =
    options.orderBy === "created_at" ? "created_at" : "updated_at";
  const order = options.order === "asc" ? "ASC" : "DESC";

  const limit =
    typeof options.limit === "number" && Number.isFinite(options.limit)
      ? Math.max(0, Math.min(1000, Math.floor(options.limit)))
      : null;
  const offset =
    typeof options.offset === "number" && Number.isFinite(options.offset)
      ? Math.max(0, Math.floor(options.offset))
      : null;

  let query = `
    SELECT *
    FROM documents
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY ${orderBy} ${order}
  `;

  if (limit !== null) {
    values.push(limit);
    query += `\n    LIMIT $${values.length}`;
  }

  if (offset !== null) {
    values.push(offset);
    query += `\n    OFFSET $${values.length}`;
  }

  query += ";\n";

  const result = await pool.query(query, values);

  return result.rows;
}

export async function getDocumentBySourceId(
  sourceId: number
): Promise<DocumentRow | null> {
  const result = await pool.query(
    `
    SELECT *
    FROM documents
    WHERE source_id = $1
    LIMIT 1;
    `,
    [sourceId]
  );

  return result.rows[0] ?? null;
}

export async function getDocumentByTitle(
  title: string
): Promise<DocumentRow | null> {
  const result = await pool.query(
    `
    SELECT *
    FROM documents
    WHERE title = $1
    LIMIT 1;
    `,
    [title]
  );

  return result.rows[0] ?? null;
}

export async function deleteDocument(
  sourceId: number
): Promise<DocumentRow | null> {
  const result = await pool.query(
    `
    DELETE FROM documents
    WHERE source_id = $1
    RETURNING *;
    `,
    [sourceId]
  );

  return result.rows[0] ?? null;
}

export async function deleteBatchDocuments(
  sourceIds: number[]
): Promise<DocumentRow[]> {
  if (!sourceIds.length) return [];

  const result = await pool.query(
    `
    DELETE FROM documents
    WHERE source_id = ANY($1::integer[])
    RETURNING *;
    `,
    [sourceIds]
  );

  return result.rows;
}
