#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TessieClient } from "./tessie-client.ts";
import { wrapContent, summarizeList } from "./format.ts";
import { toMcpError } from "./errors.ts";
import {
  toBatterySummary,
  toDriveSummary,
  toStateSummary,
  toVehicleListItem,
} from "./mappers.ts";
import {
  TessieBatteryState,
  TessieDrive,
  TessieVehicleState,
} from "./types.ts";

export const configSchema = z.object({
  TESSIE_API_KEY: z
    .string()
    .min(1)
    .describe("Tessie API access token from https://dash.tessie.com/settings/api"),
});

export function getTool(server: McpServer, name: string) {
  // MCP SDK keeps tools private; this is a test helper.
  return (server as any)._registeredTools?.[name];
}

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/i;

const operations = [
  "lock",
  "unlock",
  "start_charging",
  "stop_charging",
  "set_charge_limit",
  "set_charging_amps",
  "set_temperature",
  "start_climate",
  "stop_climate",
  "flash_lights",
  "honk",
  "wake",
  "start_defrost",
  "stop_defrost",
  "start_steering_wheel_heater",
  "stop_steering_wheel_heater",
  "set_cabin_overheat_protection",
  "set_cabin_overheat_protection_temp",
  "enable_sentry_mode",
  "disable_sentry_mode",
  "enable_speed_limit",
  "disable_speed_limit",
  "clear_speed_limit_pin",
  "set_seat_heating",
  "set_seat_cooling",
  "set_speed_limit",
] as const;

const SAFE_OPERATIONS: Operation[] = ["flash_lights", "honk", "wake"];
const LIST_LIMIT = 12;
const PATH_POINT_LIMIT = 200;

type Operation = (typeof operations)[number];

type CommandInput = {
  vin: string;
  operation: Operation;
  params?: {
    charge_limit_percent?: number;
    charging_amps?: number;
    cabin_temp_c?: number;
    seat_position?: number;
    seat_level?: number;
    speed_limit_mph?: number;
    speed_limit_pin?: string;
    fan_only?: boolean;
    cabin_overheat_on?: boolean;
    cabin_overheat_temp_c?: number;
    wait_for_completion?: boolean;
    confirm?: boolean;
  };
};

const commandMap: Record<
  CommandInput["operation"],
  {
    endpoint: string;
    buildPayload?: (params?: CommandInput["params"]) => Record<string, unknown>;
  }
> = {
  lock: { endpoint: "lock" },
  unlock: { endpoint: "unlock" },
  start_charging: { endpoint: "start_charging" },
  stop_charging: { endpoint: "stop_charging" },
  flash_lights: { endpoint: "flash" },
  honk: { endpoint: "honk" },
  wake: { endpoint: "wake" },
  start_climate: { endpoint: "start_climate" },
  stop_climate: { endpoint: "stop_climate" },
  start_defrost: { endpoint: "start_max_defrost" },
  stop_defrost: { endpoint: "stop_max_defrost" },
  start_steering_wheel_heater: { endpoint: "start_steering_wheel_heater" },
  stop_steering_wheel_heater: { endpoint: "stop_steering_wheel_heater" },
  set_charge_limit: {
    endpoint: "set_charge_limit",
    buildPayload: (p) => ({
      percent: p?.charge_limit_percent,
      wait_for_completion: p?.wait_for_completion ?? true,
    }),
  },
  set_charging_amps: {
    endpoint: "set_charging_amps",
    buildPayload: (p) => ({
      amps: p?.charging_amps,
      wait_for_completion: p?.wait_for_completion ?? true,
    }),
  },
  set_temperature: {
    endpoint: "set_temperature",
    buildPayload: (p) => ({
      temperature: p?.cabin_temp_c,
      wait_for_completion: p?.wait_for_completion ?? true,
    }),
  },
  set_seat_heating: {
    endpoint: "set_seat_heat",
    buildPayload: (p) => ({
      seat: p?.seat_position,
      level: p?.seat_level,
      wait_for_completion: p?.wait_for_completion ?? true,
    }),
  },
  set_seat_cooling: {
    endpoint: "set_seat_cool",
    buildPayload: (p) => ({
      seat: p?.seat_position,
      level: p?.seat_level,
      wait_for_completion: p?.wait_for_completion ?? true,
    }),
  },
  set_speed_limit: {
    endpoint: "set_speed_limit",
    buildPayload: (p) => ({
      mph: p?.speed_limit_mph,
      wait_for_completion: p?.wait_for_completion ?? true,
    }),
  },
  enable_speed_limit: {
    endpoint: "enable_speed_limit",
    buildPayload: (p) => ({
      pin: p?.speed_limit_pin,
      wait_for_completion: p?.wait_for_completion ?? true,
    }),
  },
  disable_speed_limit: {
    endpoint: "disable_speed_limit",
    buildPayload: (p) => ({
      pin: p?.speed_limit_pin,
      wait_for_completion: p?.wait_for_completion ?? true,
    }),
  },
  clear_speed_limit_pin: {
    endpoint: "clear_speed_limit_pin",
    buildPayload: (p) => ({
      pin: p?.speed_limit_pin,
      wait_for_completion: p?.wait_for_completion ?? true,
    }),
  },
  set_cabin_overheat_protection: {
    endpoint: "set_cabin_overheat_protection",
    buildPayload: (p) => ({
      on: p?.cabin_overheat_on,
      fan_only: p?.fan_only,
      wait_for_completion: p?.wait_for_completion ?? true,
    }),
  },
  set_cabin_overheat_protection_temp: {
    endpoint: "set_cop_temp",
    buildPayload: (p) => ({
      cop_temp: p?.cabin_overheat_temp_c,
      wait_for_completion: p?.wait_for_completion ?? true,
    }),
  },
  enable_sentry_mode: { endpoint: "enable_sentry" },
  disable_sentry_mode: { endpoint: "disable_sentry" },
};

function ensurePositive(value: number | undefined, name: string) {
  if (value === undefined || Number.isNaN(value) || value <= 0) {
    throw new Error(`Missing or invalid ${name}`);
  }
}

function ensureNumberProvided(
  value: number | undefined,
  name: string,
  allowZero = false,
) {
  if (value === undefined || Number.isNaN(value) || (!allowZero && value <= 0)) {
    throw new Error(`Missing or invalid ${name}`);
  }
}

function ensureNonEmptyString(value: string | undefined, name: string) {
  if (!value || !value.trim()) {
    throw new Error(`Missing or invalid ${name}`);
  }
}

function ensureRange(
  value: number | undefined,
  name: string,
  min: number,
  max: number,
) {
  if (value === undefined || Number.isNaN(value) || value < min || value > max) {
    throw new Error(`Missing or invalid ${name} (expected ${min}-${max})`);
  }
}

function ensureBoolean(value: boolean | undefined, name: string) {
  if (value === undefined || typeof value !== "boolean") {
    throw new Error(`Missing or invalid ${name}`);
  }
}

export default function createServer({
  config,
  client: clientOverride,
}: {
  config: z.infer<typeof configSchema>;
  client?: TessieClient;
}) {
  const apiKey = config.TESSIE_API_KEY.trim();
  const server = new McpServer({
    name: "tessie-mcp-server",
    title: "Tessie Vehicle Data (v2)",
    version: "2.0.0",
  });

  const client = clientOverride ?? new TessieClient(apiKey);

  server.tool(
    "get_active_context",
    "Quick context: vehicles you can access plus next-step guidance.",
    {
      only_active: z.boolean().optional().describe("Only include vehicles with an active status."),
    },
    async ({ only_active }) => {
      try {
        const vehicles = await client.listVehicles({ onlyActive: only_active });
        const items = vehicles.map((v) => toVehicleListItem(v));

        return wrapContent({
          vehicles: summarizeList(items, LIST_LIMIT),
          next_steps: [
            "Use fetch_vehicle_state to inspect a specific VIN.",
            "Use manage_vehicle_command to act safely with confirmation.",
            "Use search_drives to pull recent driving history.",
          ],
        });
      } catch (error) {
        return wrapContent(toMcpError(error, "get_active_context"));
      }
    },
  );

  server.tool(
    "fetch_vehicle_state",
    "Fetch the latest vehicle state (location, climate, locks, battery snapshot).",
    {
      vin: z.string().regex(VIN_REGEX, "VIN must be 17 alphanumeric characters (no I/O/Q).").describe("Vehicle VIN."),
    },
    async ({ vin }) => {
      try {
        const state: TessieVehicleState = await client.getVehicleState(vin);
        const summary = toStateSummary(vin, state);

        return wrapContent({
          summary,
          raw_state: state,
        });
      } catch (error) {
        return wrapContent(toMcpError(error, "fetch_vehicle_state"));
      }
    },
  );

  server.tool(
    "fetch_vehicle_battery",
    "Fetch battery and charging details for a vehicle.",
    {
      vin: z.string().regex(VIN_REGEX, "VIN must be 17 alphanumeric characters (no I/O/Q).").describe("Vehicle VIN."),
    },
    async ({ vin }) => {
      try {
        const battery: TessieBatteryState = await client.getVehicleBattery(vin);
        return wrapContent({
          summary: toBatterySummary(vin, battery),
          battery,
        });
      } catch (error) {
        return wrapContent(toMcpError(error, "fetch_vehicle_battery"));
      }
    },
  );

  server.tool(
    "search_drives",
    "List recent drives for a vehicle (summary-first with optional date range).",
    {
      vin: z.string().regex(VIN_REGEX, "VIN must be 17 alphanumeric characters (no I/O/Q).").describe("Vehicle VIN."),
      start: z.string().optional().describe("ISO 8601 start timestamp."),
      end: z.string().optional().describe("ISO 8601 end timestamp."),
      limit: z.number().int().positive().optional().default(20),
    },
    async ({ vin, start, end, limit = 20 }) => {
      try {
        const drives: TessieDrive[] = await client.getDrives(vin, { start, end, limit });
        const summaries = drives.map((drive) => toDriveSummary(drive));

        return wrapContent({
          vin,
          drives: summarizeList(summaries, limit),
          note: "Use get_driving_path for coordinates or fetch_vehicle_state for live status.",
        });
      } catch (error) {
        return wrapContent(toMcpError(error, "search_drives"));
      }
    },
  );

  server.tool(
    "get_driving_path",
    "Get driving path coordinates for a vehicle over a timeframe.",
    {
      vin: z.string().regex(VIN_REGEX, "VIN must be 17 alphanumeric characters (no I/O/Q).").describe("Vehicle VIN."),
      start: z.string().optional().describe("ISO 8601 start timestamp."),
      end: z.string().optional().describe("ISO 8601 end timestamp."),
    },
    async ({ vin, start, end }) => {
      try {
        const path: any[] = await client.getDrivingPath(vin, { start, end });
        return wrapContent({
          vin,
          points: summarizeList(path, PATH_POINT_LIMIT),
          guidance: "Use this polyline for mapping or anomaly detection.",
        });
      } catch (error) {
        return wrapContent(toMcpError(error, "get_driving_path"));
      }
    },
  );

  server.tool(
    "manage_vehicle_command",
    "Composite command executor for Tessie vehicle actions (lock, charging, climate, speed limit, sentry). Speed limit PIN is sensitive—avoid logging or sharing it.",
    {
      vin: z.string().regex(VIN_REGEX, "VIN must be 17 alphanumeric characters (no I/O/Q).").describe("Vehicle VIN."),
      operation: z.enum(operations),
      params: z
        .object({
          charge_limit_percent: z.number().optional(),
          charging_amps: z.number().optional(),
          cabin_temp_c: z.number().optional(),
          seat_position: z
            .number()
            .optional()
            .describe("Seat index per Tessie docs (0=driver,1=passenger,...)."),
          seat_level: z
            .number()
            .optional()
            .describe("Heating/cooling level (0-3)."),
          speed_limit_mph: z.number().optional(),
          speed_limit_pin: z.string().optional().describe("Speed limit PIN (sensitive; avoid logging)."),
          fan_only: z.boolean().optional(),
          cabin_overheat_on: z.boolean().optional(),
          cabin_overheat_temp_c: z.number().optional(),
          wait_for_completion: z.boolean().optional(),
          confirm: z
            .boolean()
            .optional()
            .describe("Required true for state-changing operations."),
        })
        .optional(),
    },
    async ({ vin, operation, params }) => {
      try {
        const config = commandMap[operation];
        if (!config) {
          throw new Error(`Unsupported operation: ${operation}`);
        }

        const isDestructive = !SAFE_OPERATIONS.includes(operation);
        if (isDestructive && params?.confirm !== true) {
          return wrapContent({
            isError: true,
            message: "Confirmation required for this operation.",
            guidance: "Pass params.confirm: true to proceed.",
          });
        }

        if (operation === "set_charge_limit") {
          ensureRange(params?.charge_limit_percent, "charge_limit_percent", 1, 100);
        }
        if (operation === "set_charging_amps") {
          ensurePositive(params?.charging_amps, "charging_amps");
        }
        if (operation === "set_temperature") {
          ensureRange(params?.cabin_temp_c, "cabin_temp_c", -10, 40);
        }
        if (operation === "set_speed_limit") {
          ensurePositive(params?.speed_limit_mph, "speed_limit_mph");
        }
        if (operation === "set_seat_heating" || operation === "set_seat_cooling") {
          ensureNumberProvided(params?.seat_position, "seat_position", true);
          ensureRange(params?.seat_level, "seat_level", 0, 3);
        }
        if (
          operation === "enable_speed_limit" ||
          operation === "disable_speed_limit" ||
          operation === "clear_speed_limit_pin"
        ) {
          ensureNonEmptyString(params?.speed_limit_pin, "speed_limit_pin");
        }
        if (operation === "set_cabin_overheat_protection_temp") {
          ensureRange(params?.cabin_overheat_temp_c, "cabin_overheat_temp_c", 15, 60);
        }
        if (operation === "set_cabin_overheat_protection") {
          ensureBoolean(params?.cabin_overheat_on, "cabin_overheat_on");
        }

        const payload = config.buildPayload
          ? config.buildPayload(params)
          : { wait_for_completion: params?.wait_for_completion ?? true };

        const result = await client.sendCommand(vin, config.endpoint, payload);
        return wrapContent({
          vin,
          operation,
          request: payload,
          result,
          guidance: "Verify status with fetch_vehicle_state if needed.",
        });
      } catch (error) {
        return wrapContent(toMcpError(error, "manage_vehicle_command"));
      }
    },
  );

  return server;
}
