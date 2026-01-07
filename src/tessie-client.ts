import axios, { AxiosInstance } from "axios";
import { toMcpError } from "./errors.ts";
import {
  TessieVehicleSummary,
  TessieVehicleState,
  TessieBatteryState,
  TessieDrive,
} from "./types.ts";

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_DRIVE_LIMIT = 100;
const DEFAULT_MAX_CACHE_SIZE = 200;
const CACHE_TTL_JITTER_RATIO = 0.1; // +/-10% jitter to avoid stampedes
const DEBUG_LOG_ENABLED =
  process.env.TESSIE_MCP_DEBUG === "1" || process.env.TESSIE_MCP_DEBUG === "true";
const VEHICLE_LIST_TTL_MS = 30000;
const VEHICLE_STATE_TTL_MS = 15000;
const BATTERY_TTL_MS = 15000;
const DRIVES_TTL_MS = 30000;
const DRIVING_PATH_TTL_MS = 30000;
const HISTORICAL_STATE_TTL_MS = 30000;

/**
 * Asserts the API response is an array (or results-wrapped array). Optionally validates items.
 * NOTE: By default this only checks that items are non-null objects; for strict typing pass a validator.
 */
function assertResultsArray<T>(
  data: unknown,
  context: string,
  validate?: (item: unknown) => item is T,
): T[] {
  let items: unknown;
  if (Array.isArray(data)) {
    items = data;
  } else if (data && typeof data === "object" && "results" in data) {
    items = (data as { results?: unknown }).results;
  }
  if (!Array.isArray(items)) {
    throw new Error(`Unexpected response format from ${context}`);
  }
  for (const item of items) {
    const isValidShape =
      validate?.(item) ??
      (item !== null &&
        typeof item === "object" &&
        !Array.isArray(item));
    if (!isValidShape) {
      throw new Error(`Unexpected item shape from ${context}`);
    }
  }
  return items as T[];
}

export interface DateRange {
  start?: string;
  end?: string;
}

export type CommandPayload = Record<string, unknown>;

type CacheEntry = { expires: number; value: unknown; touched: number };

export class TessieClient {
  private client: AxiosInstance;
  private maxRetries = 3;
  private baseDelayMs = 500;
  private debugEnabled = DEBUG_LOG_ENABLED;
  private maxCacheSize = DEFAULT_MAX_CACHE_SIZE;
  private cache = new Map<string, CacheEntry>();
  private inFlight = new Map<string, Promise<unknown>>();

  private sanitizeMetaDeep(value: unknown, visited = new WeakSet<object>()): unknown {
    const SENSITIVE_KEYS = ["headers", "authorization", "auth", "token", "password", "apikey", "api_key"];
    if (value instanceof Error) {
      return { name: value.name, message: value.message };
    }
    if (Array.isArray(value)) {
      return value.map((v) => this.sanitizeMetaDeep(v, visited));
    }
    if (value && typeof value === "object") {
      if (visited.has(value as object)) {
        return "[Circular]";
      }
      visited.add(value as object);
      const clone: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        if (SENSITIVE_KEYS.includes(key.toLowerCase())) continue;
        clone[key] = this.sanitizeMetaDeep(val, visited);
      }
      return clone;
    }
    return value;
  }

  private logSafeDebug(message: string, meta: Record<string, unknown> = {}) {
    if (!this.debugEnabled) return;
    const safeMeta = this.sanitizeMetaDeep(meta);
    console.debug(`[TessieClient] ${message}`, safeMeta);
  }

  private sanitizeUrl(url?: string) {
    if (!url) return url;
    try {
      const parsed = new URL(url, "https://api.tessie.com");
      parsed.search = "";
      return parsed.toString();
    } catch {
      return url;
    }
  }

  constructor(
    apiKey: string,
    options?: {
      debugEnabled?: boolean;
      maxCacheSize?: number;
      axiosInstance?: AxiosInstance;
    },
  ) {
    this.debugEnabled = options?.debugEnabled ?? DEBUG_LOG_ENABLED;
    this.maxCacheSize = options?.maxCacheSize ?? DEFAULT_MAX_CACHE_SIZE;
    this.client =
      options?.axiosInstance ??
      axios.create({
        baseURL: "https://api.tessie.com",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: DEFAULT_TIMEOUT_MS,
      });
  }

  private serializeParams(params?: Record<string, unknown> | DateRange) {
    if (!params) return "";
    try {
      const entries = Object.entries(params as Record<string, unknown>);
      const sorted = entries.sort(([a], [b]) => a.localeCompare(b));
      return JSON.stringify(Object.fromEntries(sorted));
    } catch (error) {
      console.warn("Failed to serialize params for cache key", this.sanitizeMetaDeep(error));
      return "__UNSERIALIZABLE_PARAMS__";
    }
  }

  private cacheKey(kind: string, ...parts: string[]) {
    return [kind, ...parts].join(":");
  }

  private async cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && cached.expires > now) {
      return cached.value as T;
    }
    const pending = this.inFlight.get(key);
    if (pending) {
      return pending as Promise<T>;
    }
    const promise = (async () => {
      const value = await fetcher();
      // apply jitter to spread expirations
      const jitter = 1 + (Math.random() * 2 - 1) * CACHE_TTL_JITTER_RATIO;
      const expires = Date.now() + Math.max(0, Math.floor(ttlMs * jitter));
      this.cache.set(key, { expires, value, touched: Date.now() });
      this.pruneCache();
      return value;
    })();
    this.inFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      this.inFlight.delete(key);
    }
  }

  private pruneCache() {
    const now = Date.now();
    // drop expired first
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expires <= now) {
        this.cache.delete(key);
      }
    }
    // LRU eviction if still oversized
    if (this.cache.size <= this.maxCacheSize) return;
    const entries = Array.from(this.cache.entries()).sort((a, b) => a[1].touched - b[1].touched);
    const over = this.cache.size - this.maxCacheSize;
    for (let i = 0; i < over; i += 1) {
      const [key] = entries[i];
      this.cache.delete(key);
    }
  }

  private invalidateVin(vin: string) {
    for (const key of this.cache.keys()) {
      const segments = key.split(":");
      if (segments[0] === "vehicles") {
        this.cache.delete(key);
        continue;
      }
      if (segments.length >= 2 && segments[1] === vin) {
        this.cache.delete(key);
      }
    }
  }

  private async withRetry<T>(fn: () => Promise<T>, context: string): Promise<T> {
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        return await fn();
      } catch (error) {
        attempt += 1;
        const status = (error as any)?.response?.status;
        this.logSafeDebug("request failed", {
          context,
          attempt,
          status,
          url: this.sanitizeUrl((error as any)?.config?.url),
        });
        const retriable = status === 429 || (status && status >= 500);
        if (!retriable || attempt >= this.maxRetries) {
          throw toMcpError(error, context);
        }
        const delay = this.baseDelayMs * Math.pow(2, attempt - 1);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }

  async listVehicles(options?: { onlyActive?: boolean }): Promise<TessieVehicleSummary[]> {
    const key = this.cacheKey(
      "vehicles",
      options?.onlyActive === true ? "active" : options?.onlyActive === false ? "inactive" : "all",
    );
    return this.cached(key, VEHICLE_LIST_TTL_MS, () =>
      this.withRetry(async () => {
        const params: Record<string, unknown> = {};
        if (options?.onlyActive !== undefined) {
          params.only_active = options.onlyActive;
        }
        const response = await this.client.get<TessieVehicleSummary[] | { results: TessieVehicleSummary[] }>(
          "/vehicles",
          {
            params,
          },
        );
        return assertResultsArray<TessieVehicleSummary>(response.data, "listVehicles");
      }, "listVehicles"),
    );
  }

  async getVehicleState(vin: string): Promise<TessieVehicleState> {
    const key = this.cacheKey("state", vin);
    return this.cached(key, VEHICLE_STATE_TTL_MS, () =>
      this.withRetry(async () => {
        const response = await this.client.get<TessieVehicleState>(`/${vin}/state`);
        return response.data;
      }, "getVehicleState"),
    );
  }

  async getVehicleBattery(vin: string): Promise<TessieBatteryState> {
    const key = this.cacheKey("battery", vin);
    return this.cached(key, BATTERY_TTL_MS, () =>
      this.withRetry(async () => {
        const response = await this.client.get<TessieBatteryState>(`/${vin}/battery`);
        return response.data;
      }, "getVehicleBattery"),
    );
  }

  async getHistoricalStates(
    vin: string,
    options: DateRange & { interval?: string },
  ) {
    const key = this.cacheKey("history", vin, this.serializeParams(options));
    return this.cached(key, HISTORICAL_STATE_TTL_MS, () =>
      this.withRetry(async () => {
        const params: Record<string, string> = {};
        if (options.start) params.start = options.start;
        if (options.end) params.end = options.end;
        if (options.interval) params.interval = options.interval;
        const response = await this.client.get<Record<string, unknown>[]>(`/${vin}/states`, { params });
        return response.data;
      }, "getHistoricalStates"),
    );
  }

  async getDrives(
    vin: string,
    options: DateRange & { limit?: number },
  ): Promise<TessieDrive[]> {
    const key = this.cacheKey("drives", vin, this.serializeParams(options));
    return this.cached(key, DRIVES_TTL_MS, () =>
      this.withRetry(async () => {
        const params: Record<string, string> = {};
        if (options.start) params.start = options.start;
        if (options.end) params.end = options.end;
        if (options.limit !== undefined) {
          const bounded = Math.max(1, Math.min(options.limit, MAX_DRIVE_LIMIT));
          params.limit = String(bounded);
        }
        const response = await this.client.get<TessieDrive[] | { results: TessieDrive[] }>(`/${vin}/drives`, { params });
        return assertResultsArray<TessieDrive>(response.data, "getDrives");
      }, "getDrives"),
    );
  }

  async getDrivingPath(
    vin: string,
    options: DateRange,
  ) {
    const key = this.cacheKey("path", vin, this.serializeParams(options));
    return this.cached(key, DRIVING_PATH_TTL_MS, () =>
      this.withRetry(async () => {
        const params: Record<string, string> = {};
        if (options.start) params.start = options.start;
        if (options.end) params.end = options.end;
        const response = await this.client.get<Record<string, unknown>[]>(`/${vin}/path`, { params });
        return response.data;
      }, "getDrivingPath"),
    );
  }

  async sendCommand(
    vin: string,
    endpoint: string,
    payload: CommandPayload = {},
  ) {
    const result = await this.withRetry(async () => {
      const response = await this.client.post<Record<string, unknown>>(`/${vin}/command/${endpoint}`, payload);
      return response.data;
    }, `sendCommand:${endpoint}`);
    this.invalidateVin(vin);
    return result;
  }
}
