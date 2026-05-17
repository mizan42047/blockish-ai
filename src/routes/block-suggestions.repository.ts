import pool from "db.js";

type BlockSuggestionInput = {
  exampleUsage?: string;
  metadata?: Record<string, unknown>;
  priority?: string;
  rationale: string;
  sourceAgent?: string;
  summary: string;
  title: string;
};

type BlockSuggestionRow = {
  id: number;
  title: string;
  normalized_title: string;
  summary: string;
  rationale: string;
  example_usage: string | null;
  priority: string;
  source_agent: string;
  metadata: Record<string, unknown>;
  mention_count: number;
  created_at: Date;
  updated_at: Date;
};

export type GetBlockSuggestionsOptions = {
  limit?: number;
  offset?: number;
  order?: "asc" | "desc";
  orderBy?: "mention_count" | "updated_at" | "created_at";
  priority?: string;
  search?: string;
  sourceAgent?: string;
};

function normalizeSuggestionTitle(title: string) {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function upsertBlockSuggestion(
  data: BlockSuggestionInput
): Promise<BlockSuggestionRow> {
  const normalizedTitle = normalizeSuggestionTitle(data.title);

  const result = await pool.query(
    `
    INSERT INTO block_suggestions (
      title,
      normalized_title,
      summary,
      rationale,
      example_usage,
      priority,
      source_agent,
      metadata
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (normalized_title)
    DO UPDATE SET
      title = EXCLUDED.title,
      summary = EXCLUDED.summary,
      rationale = EXCLUDED.rationale,
      example_usage = EXCLUDED.example_usage,
      priority = EXCLUDED.priority,
      source_agent = EXCLUDED.source_agent,
      metadata = block_suggestions.metadata || EXCLUDED.metadata,
      mention_count = block_suggestions.mention_count + 1,
      updated_at = NOW()
    RETURNING *;
    `,
    [
      data.title.trim(),
      normalizedTitle,
      data.summary.trim(),
      data.rationale.trim(),
      data.exampleUsage?.trim() || null,
      data.priority?.trim() || "medium",
      data.sourceAgent?.trim() || "designer",
      data.metadata ?? {},
    ]
  );

  return result.rows[0];
}

export async function getBlockSuggestions(
  options: GetBlockSuggestionsOptions = {}
): Promise<BlockSuggestionRow[]> {
  const where: string[] = [];
  const values: unknown[] = [];

  const addWhere = (clause: string, value?: unknown) => {
    if (typeof value === "undefined") return;
    values.push(value);
    where.push(clause.replace("?", `$${values.length}`));
  };

  addWhere("priority = ?", options.priority);
  addWhere("source_agent = ?", options.sourceAgent);

  if (options.search?.trim()) {
    values.push(`%${options.search.trim()}%`);
    const placeholder = `$${values.length}`;
    where.push(
      `(title ILIKE ${placeholder} OR summary ILIKE ${placeholder} OR rationale ILIKE ${placeholder})`
    );
  }

  const orderBy =
    options.orderBy === "created_at" || options.orderBy === "updated_at"
      ? options.orderBy
      : "mention_count";
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
    FROM block_suggestions
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY ${orderBy} ${order}, updated_at DESC
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
