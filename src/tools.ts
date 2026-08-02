import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { analyzeDrives } from "./analysis.js";
import { commandPath } from "./commands.js";
import { resources, resourcePath } from "./resources.js";
import { SettingsStore } from "./settings-store.js";
import { TessieClient } from "./tessie-client.js";

type Dependencies = { client: TessieClient; store: SettingsStore; defaultVin?: string };
const VIN = /^[A-HJ-NPR-Z0-9]{17}$/i;
const text = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });
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
    const result = await deps.client.get(selected, resourcePath(resource), { start, end, limit });
    if (vin) await deps.store.setDefaultVin(selected);
    return text({ vin: selected, resource, result });
  });
  server.tool("analyze_history", "Analyze drives over a 90-day default window. Autopilot/FSD values are native Tessie telemetry and do not uniquely identify FSD.", { vin: z.string().optional(), destination: z.string().optional(), start: z.string().optional(), end: z.string().optional() }, async ({ vin, destination, start, end }) => {
    const selected = await resolveVin(vin, deps.store, deps.defaultVin); const finish = end ?? new Date().toISOString(); const begin = start ?? new Date(Date.now() - 90 * 86400000).toISOString();
    const raw = await deps.client.get(selected, "/drives", { start: begin, end: finish }); const records = Array.isArray(raw) ? raw : (raw as { results?: unknown[] }).results ?? [];
    return text({ vin: selected, start: begin, end: finish, ...analyzeDrives(records, destination) });
  });
  server.tool("get_driving_path", "Get a bounded native driving path for the selected vehicle and time window.", { vin: z.string().optional(), start: z.string(), end: z.string() }, async ({ vin, start, end }) => text(await deps.client.get(await resolveVin(vin, deps.store, deps.defaultVin), "/driving_path", { start, end })));
  server.tool("vehicle_command", "Run an allowed Tessie vehicle command. High-impact commands require confirm: true.", { vin: z.string().optional(), operation: z.string(), confirm: z.boolean().optional(), params: z.record(z.unknown()).optional() }, async ({ vin, operation, confirm, params }) => text(await deps.client.post(await resolveVin(vin, deps.store, deps.defaultVin), commandPath(operation, confirm), params)));
}
