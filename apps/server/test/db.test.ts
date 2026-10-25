import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { migrate, openDb, postgresConfig, postgresOptionsFromEnv } from "../src/db";

const SUPABASE = "postgresql://postgres.abcd:secret@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres";

describe("postgresOptionsFromEnv", () => {
  it("uses the embedded database when DATABASE_URL is unset", () => {
    expect(postgresOptionsFromEnv({})).toBeNull();
  });

  it("reads the URL, CA file and pool size", () => {
    expect(postgresOptionsFromEnv({ DATABASE_URL: SUPABASE, DATABASE_SSL_CA: "/certs/ca.crt", DATABASE_POOL_MAX: "3" })).toEqual({
      url: SUPABASE,
      caFile: "/certs/ca.crt",
      poolMax: 3,
    });
  });

  it("ignores a pool size that isn't a positive whole number", () => {
    expect(postgresOptionsFromEnv({ DATABASE_URL: SUPABASE, DATABASE_POOL_MAX: "lots" })?.poolMax).toBeUndefined();
  });
});

describe("postgresConfig", () => {
  it("keeps the pool small by default and leaves SSL to the URL", () => {
    const config = postgresConfig({ url: `${SUPABASE}?sslmode=require` });
    expect(config.max).toBe(5);
    expect(config.ssl).toBeUndefined();
    expect(config.connectionString).toContain("sslmode=require");
  });

  it("encrypts a remote database the URL says nothing about, but not a local one", () => {
    expect(postgresConfig({ url: SUPABASE }).ssl).toEqual({ rejectUnauthorized: false });
    expect(postgresConfig({ url: "postgresql://postgres:pw@localhost:5432/foa" }).ssl).toBeUndefined();
    expect(postgresConfig({ url: "postgresql://postgres:pw@127.0.0.1/foa" }).ssl).toBeUndefined();
    expect(postgresConfig({ url: `${SUPABASE}?sslmode=disable` }).ssl).toBeUndefined();
  });

  it("verifies the server against the given CA certificate", () => {
    const dir = mkdtempSync(join(tmpdir(), "foa-ca-"));
    const caFile = join(dir, "ca.crt");
    writeFileSync(caFile, "-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----\n");

    const config = postgresConfig({ url: `${SUPABASE}?sslmode=require`, caFile, poolMax: 2 });
    expect(config.max).toBe(2);
    expect(config.ssl).toEqual({ ca: expect.stringContaining("BEGIN CERTIFICATE"), rejectUnauthorized: true });
    expect(config.connectionString).not.toContain("sslmode");
  });
});

describe("migrate", () => {
  it("can run again on an existing database and turns on row-level security", async () => {
    const db = await openDb({});
    await migrate(db);
    await migrate(db);
    const rows = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('settings', 'sessions', 'orders') ORDER BY relname`,
    );
    expect(rows).toEqual([
      { relname: "orders", relrowsecurity: true },
      { relname: "sessions", relrowsecurity: true },
      { relname: "settings", relrowsecurity: true },
    ]);
    await db.close();
  });
});
