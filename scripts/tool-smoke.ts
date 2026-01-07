import "dotenv/config";
import createServer, { getTool } from "../src/index.ts";
import {
  toBatterySummary,
  toDriveSummary,
  toVehicleListItem,
} from "../src/mappers.ts";

type ToolResult = { content?: Array<{ type: string; text?: string }> };

function decode(result: ToolResult) {
  const text = result.content?.[0]?.text;
  if (!text) return result;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function main() {
  const apiKey = process.env.TESSIE_API_KEY;
  if (!apiKey) throw new Error("TESSIE_API_KEY missing (.env)");

  const server = createServer({ config: { TESSIE_API_KEY: apiKey.trim() } });

  const invoke = async (name: string, params: Record<string, unknown>) => {
    const tool = getTool(server as any, name);
    if (!tool) throw new Error(`Tool not found: ${name}`);
    const parsed = tool.inputSchema?.parse ? tool.inputSchema.parse(params) : params;
    const result = await tool.callback(parsed);
    return decode(result);
  };

  const ctx = await invoke("get_active_context", { only_active: true });
  console.log("get_active_context:", ctx);

  const vehicles = (ctx as any)?.vehicles?.items ?? [];
  if (!vehicles.length) {
    console.log("No vehicles available; skipping further tool calls.");
    return;
  }

  const vin = vehicles[0].vin;
  console.log("\nUsing VIN:", vin);

  const state = await invoke("fetch_vehicle_state", { vin });
  console.log("fetch_vehicle_state summary:", (state as any)?.summary);

  const batteryRaw = await invoke("fetch_vehicle_battery", { vin });
  console.log("fetch_vehicle_battery summary:", (batteryRaw as any)?.summary);

  const drivesRaw = await invoke("search_drives", { vin, limit: 3 });
  console.log("search_drives:", drivesRaw);

  const flash = await invoke("manage_vehicle_command", {
    vin,
    operation: "flash_lights",
  });
  console.log("manage_vehicle_command flash_lights:", flash);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
