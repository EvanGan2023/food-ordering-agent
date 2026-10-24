import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

/** The small slice of SQL the server needs, so PGlite (local) and Postgres (production) are interchangeable. */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

/**
 * DATABASE_URL set → that Postgres server.
 * Otherwise → embedded Postgres (PGlite) stored in `dataDir`, or in memory for tests.
 */
export async function openDb(options: { databaseUrl?: string; dataDir?: string }): Promise<Db> {
  if (options.databaseUrl) {
    const pool = new pg.Pool({ connectionString: options.databaseUrl });
    return {
      query: async (sql, params) => (await pool.query(sql, params)).rows,
      close: () => pool.end(),
    };
  }

  if (options.dataDir) mkdirSync(options.dataDir, { recursive: true });
  const lite = await PGlite.create(options.dataDir ?? "memory://");
  return {
    query: async <T>(sql: string, params?: unknown[]) => (await lite.query<T>(sql, params)).rows,
    close: () => lite.close(),
  };
}

export async function migrate(db: Db): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS settings (
      id text PRIMARY KEY,
      data jsonb NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      id text PRIMARY KEY,
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE SEQUENCE IF NOT EXISTS order_number_seq START 101`,
    `CREATE TABLE IF NOT EXISTS orders (
      id text PRIMARY KEY,
      number integer NOT NULL,
      pickup_code text NOT NULL,
      status text NOT NULL,
      data jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status, created_at)`,
    `CREATE INDEX IF NOT EXISTS orders_pickup_code_idx ON orders (pickup_code)`,
  ];
  for (const sql of statements) await db.query(sql);
}
