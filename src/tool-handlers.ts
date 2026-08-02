import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { analyzeDrives } from "./analysis.js";
import { buildCommand, operationSchema } from "./commands.js";
import { resources, resourcePath, timeFilteredResources } from "./resources.js";
import { SettingsStore } from "./settings-store.js";
import { TessieClient } from "./tessie-client.js";
import { MAX_PATH_POINTS, parseDateRange, readResults, resolveVin, toText } from "./tool-helpers.js";

export type ToolDependencies = { client: TessieClient; store: SettingsStore; defaultVin?: string };

export function registerReadTools(server: McpServer, deps: ToolDependencies) {
  server.tool("list_vehicles", "List vehicles without changing the selected default vehicle.", {}, async () => toText(await deps.client.listVehicles()));
  server.tool("get_vehicle", "Get Tessie data. Passing vin selects it as the persisted default after a successful read.", { vin: z.string().optional(), resource: z.enum(resources), start: z.string().optional(), end: z.string().optional(), limit: z.number().int().positive().max(500).optional() }, async ({ vin, resource, start, end, limit }) => {
    const selected = await resolveVin(vin, deps.store, deps.defaultVin);
    const query: Record<string, string | number | boolean | undefined> = { limit };
    if (timeFilteredResources.has(resource)) { const range = parseDateRange(start, end); query.from = range.from; query.to = range.to; }
    const result = await deps.client.get(selected, resourcePath(resource), query);
    if (vin) await deps.store.setDefaultVin(selected);
    return toText({ vin: selected, resource, result });
  });
}

export function registerHistoryTool(server: McpServer, deps: ToolDependencies) {
  server.tool("analyze_history", "Analyze drives, charges, idles, or historical Autopilot/FSD telemetry over a 90-day default window. Drive analysis supports origin/destination filters and duration, distance, energy, and native telemetry aggregates. Results include a bounded sample.", { vin: z.string().optional(), kind: z.enum(["drives", "charges", "idles", "historical_states"]).default("drives"), origin: z.string().optional(), destination: z.string().optional(), start: z.string().optional(), end: z.string().optional(), sampleLimit: z.number().int().min(0).max(100).optional() }, async ({ vin, kind, origin, destination, start, end, sampleLimit }) => {
    const selected = await resolveVin(vin, deps.store, deps.defaultVin); const range = parseDateRange(start, end);
    const raw = await deps.client.get(selected, `/${kind === "historical_states" ? "states" : kind}`, { from: range.from, to: range.to, limit: 1000 }); const records = readResults(raw);
    const result = kind === "drives" ? analyzeDrives(records, { origin, destination, sampleLimit }) : { matchedCount: records.length, records: records.slice(0, sampleLimit ?? 25), ...(kind === "historical_states" ? { autopilotStates: records.reduce<Record<string, number>>((counts, item) => { const state = item && typeof item === "object" && typeof (item as Record<string, unknown>).autopilot === "string" ? (item as Record<string, string>).autopilot : "unknown"; counts[state] = (counts[state] ?? 0) + 1; return counts; }, {}) } : {}) };
    return toText({ vin: selected, kind, start: range.begin, end: range.finish, ...result });
  });
}

export function registerPathTool(server: McpServer, deps: ToolDependencies) {
  server.tool("get_driving_path", `Get a native driving path for the selected vehicle and time window. At most ${MAX_PATH_POINTS} points are returned.`, { vin: z.string().optional(), start: z.string(), end: z.string() }, async ({ vin, start, end }) => {
    const selected = await resolveVin(vin, deps.store, deps.defaultVin); const range = parseDateRange(start, end, 0); const raw = await deps.client.get(selected, "/path", { from: range.from, to: range.to, simplify: true }); const points = readResults(raw);
    return toText({ vin: selected, start, end, totalPoints: points.length, truncated: points.length > MAX_PATH_POINTS, points: points.slice(0, MAX_PATH_POINTS) });
  });
}

export function registerCommandTool(server: McpServer, deps: ToolDependencies) {
  server.tool("vehicle_command", "Run an allowlisted Tessie vehicle command. High-impact commands require confirm: true.", { vin: z.string().optional(), operation: operationSchema, confirm: z.boolean().optional(), params: z.record(z.unknown()).optional() }, async ({ vin, operation, confirm, params }) => {
    const command = buildCommand(operation, params, confirm); const result = await deps.client.post(await resolveVin(vin, deps.store, deps.defaultVin), command.path, command.body); return toText(result);
  });
}
