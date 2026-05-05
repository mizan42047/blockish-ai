import pool from "db.js";

type OptionInput = {
  option_key: string;
  option_value: any;
};

type OptionRow = {
  option_key: string;
  option_value: any;
  created_at: Date;
  updated_at: Date;
};

export async function upsertOption(data: OptionInput): Promise<OptionRow> {
  const result = await pool.query(
    `
    INSERT INTO options (option_key, option_value)
    VALUES ($1, $2)
    ON CONFLICT (option_key)
    DO UPDATE SET
      option_value = EXCLUDED.option_value,
      updated_at = NOW()
    RETURNING *;
    `,
    [data.option_key, data.option_value]
  );

  return result.rows[0];
}

export async function deleteOption(
  optionKey: string
): Promise<OptionRow | null> {
  const result = await pool.query(
    `
    DELETE FROM options
    WHERE option_key = $1
    RETURNING *;
    `,
    [optionKey]
  );

  return result.rows[0] ?? null;
}

