import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { analyzeDrives } from "./analysis.js";
import { buildCommand, operationSchema } from "./commands.js";
import { resources, resourcePath, timeFilteredResources } from "./resources.js";
import { SettingsStore } from "./settings-store.js";
import { TessieClient } from "./tessie-client.js";

type Dependencies = { client: TessieClient; store: SettingsStore; defaultVin?: string };
const VIN = /^[A-HJ-NPR-Z0-9]{17}$/i;
const text = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });
const MAX_PATH_POINTS = 1000;
async function resolveVin(vin: string | undefined, store: SettingsStore, fallback?: string) {
  const selected = vin ?? await store.getDefaultVin() ?? fallback;
  if (!selected) throw new Error("Select a vehicle by passing vin to get_vehicle first");
  if (!VIN.test(selected)) throw new Error("VIN must be 17 valid VIN characters");
  return selected.toUpperCase();
}

export function registerTools(server: McpServer, deps: Dependencies) {
  server.tool("list_vehicles", "List vehicles without changing the selected default vehicle.", {}, async () => text(await deps.client.listVehicles()));
  server.tool("get_vehicle", "Get Tessie data. Passing vin selects it as the persisted default after a successful read.", { vin: z.string().optional(), resource: z.enum(resources), start: z.string().optional(), end: z.string().optional(), limit: z.number().int().positive().max(500).optional() }, async ({ vin, resource, start, end, limit }) => {
    const selected = await resolveVin(vin, deps.store, deps.defaultVin);
    const query: Record<string, string | number | undefined> = { limit }; if (timeFilteredResources.has(resource)) { const from = start ? Math.floor(Date.parse(start) / 1000) : undefined; const to = end ? Math.floor(Date.parse(end) / 1000) : undefined; if (from !== undefined && !Number.isFinite(from) || to !== undefined && !Number.isFinite(to) || from !== undefined && to !== undefined && to < from) throw new Error("start and end must be valid dates with end after start"); query.from = from; query.to = to; }
    const result = await deps.client.get(selected, resourcePath(resource), query);
    if (vin) await deps.store.setDefaultVin(selected);
    return text({ vin: selected, resource, result });
  });
  server.tool("analyze_history", "Analyze drives, charges, idles, or historical Autopilot/FSD telemetry over a 90-day default window. Drive analysis supports origin/destination filters and duration, distance, energy, and native telemetry aggregates. Results include a bounded sample.", { vin: z.string().optional(), kind: z.enum(["drives", "charges", "idles", "historical_states"]).default("drives"), origin: z.string().optional(), destination: z.string().optional(), start: z.string().optional(), end: z.string().optional(), sampleLimit: z.number().int().min(0).max(100).optional() }, async ({ vin, kind, origin, destination, start, end, sampleLimit }) => {
    const selected = await resolveVin(vin, deps.store, deps.defaultVin); const finish = end ?? new Date().toISOString(); const begin = start ?? new Date(Date.now() - 90 * 86400000).toISOString();
    const from = Math.floor(Date.parse(begin) / 1000); const to = Math.floor(Date.parse(finish) / 1000); if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) throw new Error("start and end must be valid dates with end after start");
    const raw = await deps.client.get(selected, `/${kind === "historical_states" ? "states" : kind}`, { from, to }); const records = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { results?: unknown }).results) ? (raw as { results: unknown[] }).results : [];
    const result = kind === "drives" ? analyzeDrives(records, { origin, destination, sampleLimit }) : { matchedCount: records.length, records: records.slice(0, sampleLimit ?? 25), ...(kind === "historical_states" ? { autopilotStates: records.reduce<Record<string, number>>((counts, item) => { const state = item && typeof item === "object" && typeof (item as Record<string, unknown>).autopilot === "string" ? (item as Record<string, string>).autopilot : "unknown"; counts[state] = (counts[state] ?? 0) + 1; return counts; }, {}) } : {}) };
    return text({ vin: selected, kind, start: begin, end: finish, ...result });
  });
  server.tool("get_driving_path", `Get a native driving path for the selected vehicle and time window. At most ${MAX_PATH_POINTS} points are returned.`, { vin: z.string().optional(), start: z.string(), end: z.string() }, async ({ vin, start, end }) => {
    const selected = await resolveVin(vin, deps.store, deps.defaultVin); const from = Math.floor(Date.parse(start) / 1000); const to = Math.floor(Date.parse(end) / 1000); if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) throw new Error("start and end must be valid dates with end after start");
    const raw = await deps.client.get(selected, "/path", { from, to }); const points = raw && typeof raw === "object" && Array.isArray((raw as { results?: unknown }).results) ? (raw as { results: unknown[] }).results : [];
    return text({ vin: selected, start, end, totalPoints: points.length, truncated: points.length > MAX_PATH_POINTS, points: points.slice(0, MAX_PATH_POINTS) });
  });
  server.tool("vehicle_command", "Run an allowlisted Tessie vehicle command. High-impact commands require confirm: true.", { vin: z.string().optional(), operation: operationSchema, confirm: z.boolean().optional(), params: z.record(z.unknown()).optional() }, async ({ vin, operation, confirm, params }) => {
    const command = buildCommand(operation, params, confirm); const result = await deps.client.post(await resolveVin(vin, deps.store, deps.defaultVin), command.path, command.body); return text(result);
  });
}
