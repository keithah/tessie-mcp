import axios, { AxiosInstance } from "axios";
import { toMcpError } from "./errors.ts";

export type VehicleSummary = {
  vin: string;
  display_name?: string;
  state?: string;
  vehicle_state?: Record<string, unknown>;
  last_seen?: string;
  last_state?: Record<string, unknown>;
};

export type VehicleState = Record<string, unknown>;
export type VehicleBattery = Record<string, unknown>;

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
      timeout: 30000,
    });
  }

  async listVehicles(options?: { onlyActive?: boolean }) {
    try {
      const params: Record<string, unknown> = {};
      if (options?.onlyActive !== undefined) {
        params.only_active = options.onlyActive;
      }
      const response = await this.client.get<VehicleSummary[] | { results: VehicleSummary[] }>("/vehicles", {
        params,
      });
      const data = response.data as any;
      if (data && typeof data === "object" && Array.isArray((data as any).results)) {
        return (data as any).results as VehicleSummary[];
      }
      return data as VehicleSummary[];
    } catch (error) {
      throw toMcpError(error, "listVehicles");
    }
  }

  async getVehicleState(vin: string) {
    try {
      const response = await this.client.get<VehicleState>(`/${vin}/state`);
      return response.data;
    } catch (error) {
      throw toMcpError(error, "getVehicleState");
    }
  }

  async getVehicleBattery(vin: string) {
    try {
      const response = await this.client.get<VehicleBattery>(`/${vin}/battery`);
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
  ) {
    try {
      const params: Record<string, string> = {};
      if (options.start) params.start = options.start;
      if (options.end) params.end = options.end;
      if (options.limit !== undefined) params.limit = String(options.limit);
      const response = await this.client.get<Record<string, unknown>[] | { results: Record<string, unknown>[] }>(`/${vin}/drives`, { params });
      const data = response.data as any;
      if (data && typeof data === "object" && Array.isArray(data.results)) {
        return data.results as Record<string, unknown>[];
      }
      return data as Record<string, unknown>[];
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
