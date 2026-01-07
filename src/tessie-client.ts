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

export interface DateRange {
  start?: string;
  end?: string;
}

export type CommandPayload = Record<string, unknown>;

export class TessieClient {
  private client: AxiosInstance;

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

  async listVehicles(options?: { onlyActive?: boolean }): Promise<TessieVehicleSummary[]> {
    try {
      const params: Record<string, unknown> = {};
      if (options?.onlyActive !== undefined) {
        params.only_active = options.onlyActive;
      }
      const response = await this.client.get<TessieVehicleSummary[] | { results: TessieVehicleSummary[] }>("/vehicles", {
        params,
      });
      const data = response.data as any;
      if (data && typeof data === "object" && Array.isArray((data as any).results)) {
        return (data as any).results as TessieVehicleSummary[];
      }
      return data as TessieVehicleSummary[];
    } catch (error) {
      throw toMcpError(error, "listVehicles");
    }
  }

  async getVehicleState(vin: string): Promise<TessieVehicleState> {
    try {
      const response = await this.client.get<TessieVehicleState>(`/${vin}/state`);
      return response.data;
    } catch (error) {
      throw toMcpError(error, "getVehicleState");
    }
  }

  async getVehicleBattery(vin: string): Promise<TessieBatteryState> {
    try {
      const response = await this.client.get<TessieBatteryState>(`/${vin}/battery`);
      return response.data;
    } catch (error) {
      throw toMcpError(error, "getVehicleBattery");
    }
  }

  async getHistoricalStates(
    vin: string,
    options: DateRange & { interval?: string },
  ) {
    try {
      const params: Record<string, string> = {};
      if (options.start) params.start = options.start;
      if (options.end) params.end = options.end;
      if (options.interval) params.interval = options.interval;
      const response = await this.client.get<Record<string, unknown>[]>(
        `/${vin}/states`,
        { params },
      );
      return response.data;
    } catch (error) {
      throw toMcpError(error, "getHistoricalStates");
    }
  }

  async getDrives(
    vin: string,
    options: DateRange & { limit?: number },
  ): Promise<TessieDrive[]> {
    try {
      const params: Record<string, string> = {};
      if (options.start) params.start = options.start;
      if (options.end) params.end = options.end;
      if (options.limit !== undefined) {
        const bounded = Math.max(1, Math.min(options.limit, MAX_DRIVE_LIMIT));
        params.limit = String(bounded);
      }
      const response = await this.client.get<TessieDrive[] | { results: TessieDrive[] }>(`/${vin}/drives`, { params });
      const data = response.data as any;
      if (data && typeof data === "object" && Array.isArray(data.results)) {
        return data.results as TessieDrive[];
      }
      return data as TessieDrive[];
    } catch (error) {
      throw toMcpError(error, "getDrives");
    }
  }

  async getDrivingPath(
    vin: string,
    options: DateRange,
  ) {
    try {
      const params: Record<string, string> = {};
      if (options.start) params.start = options.start;
      if (options.end) params.end = options.end;
      const response = await this.client.get<Record<string, unknown>[]>(
        `/${vin}/path`,
        { params },
      );
      return response.data;
    } catch (error) {
      throw toMcpError(error, "getDrivingPath");
    }
  }

  async sendCommand(
    vin: string,
    endpoint: string,
    payload: CommandPayload = {},
  ) {
    try {
      const response = await this.client.post<Record<string, unknown>>(
        `/${vin}/command/${endpoint}`,
        payload,
      );
      return response.data;
    } catch (error) {
      throw toMcpError(error, `sendCommand:${endpoint}`);
    }
  }
}
