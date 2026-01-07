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
const DEBUG_LOG_ENABLED = process.env.TESSIE_MCP_DEBUG === "1";

function assertResultsArray<T>(data: unknown, context: string): T[] {
  if (Array.isArray(data)) {
    return data as T[];
  }
  if (data && typeof data === "object" && "results" in data) {
    const maybeResults = (data as { results?: unknown }).results;
    if (Array.isArray(maybeResults)) {
      return maybeResults as T[];
    }
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

  private logSafeDebug(message: string, meta: Record<string, unknown> = {}) {
    if (!this.debugEnabled) return;
    const safeMeta = { ...meta };
    delete (safeMeta as any).headers;
    console.debug(`[TessieClient] ${message}`, safeMeta);
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
    return this.withRetry(async () => {
      const params: Record<string, unknown> = {};
      if (options?.onlyActive !== undefined) {
        params.only_active = options.onlyActive;
      }
      const response = await this.client.get<TessieVehicleSummary[] | { results: TessieVehicleSummary[] }>("/vehicles", {
        params,
      });
      return assertResultsArray<TessieVehicleSummary>(response.data, "listVehicles");
    }, "listVehicles");
  }

  async getVehicleState(vin: string): Promise<TessieVehicleState> {
    return this.withRetry(async () => {
      const response = await this.client.get<TessieVehicleState>(`/${vin}/state`);
      return response.data;
    }, "getVehicleState");
  }

  async getVehicleBattery(vin: string): Promise<TessieBatteryState> {
    return this.withRetry(async () => {
      const response = await this.client.get<TessieBatteryState>(`/${vin}/battery`);
      return response.data;
    }, "getVehicleBattery");
  }

  async getHistoricalStates(
    vin: string,
    options: DateRange & { interval?: string },
  ) {
    return this.withRetry(async () => {
      const params: Record<string, string> = {};
      if (options.start) params.start = options.start;
      if (options.end) params.end = options.end;
      if (options.interval) params.interval = options.interval;
      const response = await this.client.get<Record<string, unknown>[]>(
        `/${vin}/states`,
        { params },
      );
      return response.data;
    }, "getHistoricalStates");
  }

  async getDrives(
    vin: string,
    options: DateRange & { limit?: number },
  ): Promise<TessieDrive[]> {
    return this.withRetry(async () => {
      const params: Record<string, string> = {};
      if (options.start) params.start = options.start;
      if (options.end) params.end = options.end;
      if (options.limit !== undefined) {
        const bounded = Math.max(1, Math.min(options.limit, MAX_DRIVE_LIMIT));
        params.limit = String(bounded);
      }
      const response = await this.client.get<TessieDrive[] | { results: TessieDrive[] }>(`/${vin}/drives`, { params });
      return assertResultsArray<TessieDrive>(response.data, "getDrives");
    }, "getDrives");
  }

  async getDrivingPath(
    vin: string,
    options: DateRange,
  ) {
    return this.withRetry(async () => {
      const params: Record<string, string> = {};
      if (options.start) params.start = options.start;
      if (options.end) params.end = options.end;
      const response = await this.client.get<Record<string, unknown>[]>(
        `/${vin}/path`,
        { params },
      );
      return response.data;
    }, "getDrivingPath");
  }

  async sendCommand(
    vin: string,
    endpoint: string,
    payload: CommandPayload = {},
  ) {
    return this.withRetry(async () => {
      const response = await this.client.post<Record<string, unknown>>(
        `/${vin}/command/${endpoint}`,
        payload,
      );
      return response.data;
    }, `sendCommand:${endpoint}`);
  }
}
