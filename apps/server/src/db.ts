import { mkdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

/** The small slice of SQL the server needs, so PGlite (local) and Postgres (production) are interchangeable. */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

export interface PostgresOptions {
  url: string;
  /** PEM file with the server's CA certificate (Supabase: Database settings → SSL → download). Verifies the connection. */
  caFile?: string;
  /** Pool size; keep it small on hosted plans with connection limits. */
  poolMax?: number;
}

/** Pool settings for a Postgres server such as Supabase. */
export function postgresConfig(options: PostgresOptions): pg.PoolConfig {
  const config: pg.PoolConfig = { connectionString: options.url, max: options.poolMax ?? 5 };
  if (options.caFile) {
    // An explicit `ssl` object replaces any sslmode in the URL, so drop it to avoid a conflict.
    const url = new URL(options.url);
    url.searchParams.delete("sslmode");
    config.connectionString = url.toString();
    config.ssl = { ca: readFileSync(options.caFile, "utf8"), rejectUnauthorized: true };
  }
  return config;
}

export function postgresOptionsFromEnv(env: Record<string, string | undefined> = process.env): PostgresOptions | null {
  if (!env.DATABASE_URL) return null;
  const poolMax = Number(env.DATABASE_POOL_MAX);
  return {
    url: env.DATABASE_URL,
    caFile: env.DATABASE_SSL_CA || undefined,
    poolMax: Number.isInteger(poolMax) && poolMax > 0 ? poolMax : undefined,
  };
}

/**
 * Postgres options given (DATABASE_URL, e.g. Supabase) → that server.
 * Otherwise → embedded Postgres (PGlite) stored in `dataDir`, or in memory for tests.
 */
export async function openDb(options: { postgres?: PostgresOptions | null; dataDir?: string }): Promise<Db> {
  if (options.postgres) {
    const pool = new pg.Pool(postgresConfig(options.postgres));
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
    // Supabase serves the public schema over its REST API. Row-level security with no policies
    // closes that door; this server connects as the table owner, which RLS doesn't restrict.
    `ALTER TABLE settings ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE sessions ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE orders ENABLE ROW LEVEL SECURITY`,
  ];
  for (const sql of statements) await db.query(sql);
}
