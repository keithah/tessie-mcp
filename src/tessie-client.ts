const BASE_URL = "https://api.tessie.com";
import type { JsonValue, QueryPayload } from "./tessie-types.js";

export class TessieClient {
  constructor(private readonly apiKey: string, private readonly fetcher: typeof fetch = fetch) {}

  async request<T extends JsonValue>(path: string, options: RequestInit = {}): Promise<T> {
    const url = new URL(path, BASE_URL);
    let response: Response | undefined;
    let networkFailure = false;
    const retryable = (options.method ?? "GET").toUpperCase() === "GET";
    const attempts = retryable ? 3 : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        response = await this.fetcher(url, { ...options, headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", ...options.headers }, signal: AbortSignal.timeout(30_000) });
        networkFailure = false;
        if (response.ok || (response.status !== 429 && response.status < 500) || attempt === attempts - 1) break;
      } catch { networkFailure = true; response = undefined; if (attempt === attempts - 1) break; }
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
    if (networkFailure) throw new Error("Tessie request failed (network)");
    if (!response?.ok) throw new Error(`Tessie request failed (${response?.status ?? "network"})`);
    return response.json() as Promise<T>;
  }
  listVehicles() { return this.request<JsonValue>("/vehicles"); }
  get(vin: string, path: string, query?: Record<string, string | number | boolean | undefined>) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) if (value !== undefined) params.set(key, String(value));
    return this.request<JsonValue>(`/${vin}${path}${params.size ? `?${params}` : ""}`);
  }
  post(vin: string, path: string, body?: QueryPayload) {
    const query = new URLSearchParams(); if (body && typeof body === "object" && !Array.isArray(body)) for (const [key, value] of Object.entries(body)) if (value !== undefined) query.set(key, String(value));
    return this.request<JsonValue>(`/${vin}${path}${query.size ? `?${query}` : ""}`, { method: "POST" });
  }
}
