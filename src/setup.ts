import pool from "./db.js";

export async function createTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id SERIAL PRIMARY KEY,
      source_id INTEGER UNIQUE,

      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT NOT NULL,

      metadata JSONB,
      embedding VECTOR(1536),

      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS options (
      option_key TEXT PRIMARY KEY,
      option_value JSONB NOT NULL,

      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS block_suggestions (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      normalized_title TEXT UNIQUE NOT NULL,
      summary TEXT NOT NULL,
      rationale TEXT NOT NULL,
      example_usage TEXT,
      priority TEXT NOT NULL DEFAULT 'medium',
      source_agent TEXT NOT NULL DEFAULT 'designer',
      metadata JSONB NOT NULL DEFAULT '{}',
      mention_count INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
`);

  console.log("Tables created.");
}
