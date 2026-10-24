/**
 * A small client for Square's REST API (https://developer.squareup.com/reference/square).
 * Uses plain fetch so the server needs no Square SDK.
 */

/** The API version this code was written against; Square keeps old versions working. */
export const SQUARE_VERSION = "2026-09-16";

export interface SquareConfig {
  accessToken: string;
  locationId: string;
  environment: "sandbox" | "production";
}

export function squareConfigFromEnv(env: Record<string, string | undefined> = process.env): SquareConfig | null {
  const accessToken = env.SQUARE_ACCESS_TOKEN?.trim();
  const locationId = env.SQUARE_LOCATION_ID?.trim();
  if (!accessToken || !locationId) return null;
  return { accessToken, locationId, environment: env.SQUARE_ENVIRONMENT === "production" ? "production" : "sandbox" };
}

export class SquareError extends Error {
  constructor(
    readonly status: number,
    /** Square's error list, e.g. [{ category: "INVALID_REQUEST_ERROR", code: "MISSING_REQUIRED_PARAMETER", detail: "..." }]. */
    readonly errors: { category?: string; code?: string; detail?: string; field?: string }[],
  ) {
    super(`Square ${status}: ${errors.map((e) => e.detail ?? e.code).join("; ") || "request failed"}`);
    this.name = "SquareError";
  }
}

export interface SquareClient {
  readonly config: SquareConfig;
  request<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T>;
}

export function createSquareClient(config: SquareConfig, fetchImpl: typeof fetch = fetch): SquareClient {
  const base = config.environment === "production" ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com";
  return {
    config,
    async request<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown) {
      const res = await fetchImpl(`${base}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${config.accessToken}`,
          "square-version": SQUARE_VERSION,
          "content-type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { errors?: SquareError["errors"] };
      if (!res.ok || data.errors?.length) throw new SquareError(res.status, data.errors ?? []);
      return data as T;
    },
  };
}
