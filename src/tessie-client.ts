const BASE_URL = "https://api.tessie.com";

export class TessieClient {
  constructor(private readonly apiKey: string, private readonly fetcher: typeof fetch = fetch) {}

  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = new URL(path, BASE_URL);
    let response: Response | undefined;
    let networkFailure = false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        response = await this.fetcher(url, { ...options, headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", ...options.headers }, signal: AbortSignal.timeout(30_000) });
        networkFailure = false;
        if (response.ok || (response.status !== 429 && response.status < 500) || attempt === 2) break;
      } catch { networkFailure = true; response = undefined; if (attempt === 2) break; }
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
    if (networkFailure) throw new Error("Tessie request failed (network)");
    if (!response?.ok) throw new Error(`Tessie request failed (${response?.status ?? "network"})`);
    return response.json() as Promise<T>;
  }
  listVehicles() { return this.request<unknown>("/vehicles"); }
  get(vin: string, path: string, query?: Record<string, string | number | undefined>) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) if (value !== undefined) params.set(key, String(value));
    return this.request<unknown>(`/${vin}${path}${params.size ? `?${params}` : ""}`);
  }
  post(vin: string, path: string, body?: unknown) { return this.request<unknown>(`/${vin}${path}`, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }); }
}
