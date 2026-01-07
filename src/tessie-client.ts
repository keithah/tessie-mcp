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
 * Does not deep-validate shapes unless a validator is provided.
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
  if (Array.isArray(items)) {
    if (validate) {
      for (const item of items) {
        if (!validate(item)) {
          throw new Error(`Unexpected item shape from ${context}`);
        }
      }
    }
    return items as T[];
  }
  throw new Error(`Unexpected response format from ${context}`);
}

export interface DateRange {
  start?: string;
  end?: string;
}

export type CommandPayload = Record<string, unknown>;

export class TessieClient {
  private client: AxiosInstance;
  private maxRetries = 3;
  private baseDelayMs = 500;
  private debugEnabled = DEBUG_LOG_ENABLED;
  private cache = new Map<string, { expires: number; value: unknown }>();

  private sanitizeMetaDeep(value: unknown): unknown {
    const SENSITIVE_KEYS = ["headers", "authorization", "auth", "token", "password", "apikey", "api_key"];
    if (Array.isArray(value)) {
      return value.map((v) => this.sanitizeMetaDeep(v));
    }
    if (value && typeof value === "object") {
      const clone: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        if (SENSITIVE_KEYS.includes(key.toLowerCase())) continue;
        clone[key] = this.sanitizeMetaDeep(val);
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

  private serializeParams(params?: Record<string, unknown> | DateRange) {
    if (!params) return "";
    const entries = Object.entries(params as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return JSON.stringify(Object.fromEntries(entries));
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
    const value = await fetcher();
    this.cache.set(key, { expires: now + ttlMs, value });
    return value;
  }

  private invalidate(predicate: (key: string) => boolean) {
    for (const key of this.cache.keys()) {
      if (predicate(key)) {
        this.cache.delete(key);
      }
    }
  }

  private invalidateVin(vin: string) {
    this.invalidate((key) => key.includes(`:${vin}`));
  }

  constructor(apiKey: string) {
    this.client = axios.create({
      baseURL: "https://api.tessie.com",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: DEFAULT_TIMEOUT_MS,
    });
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
          url: (error as any)?.config?.url,
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
    const key = this.cacheKey("vehicles", options?.onlyActive ? "active" : "all");
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
