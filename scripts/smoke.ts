import "dotenv/config";
import { TessieClient } from "../src/tessie-client.ts";

async function main() {
  const apiKey = process.env.TESSIE_API_KEY;
  if (!apiKey) {
    throw new Error("TESSIE_API_KEY missing (set it in .env for smoke test)");
  }

  const client = new TessieClient(apiKey.trim());

  const vehicles = await client.listVehicles({ onlyActive: true });
  console.log("Vehicles (first 3):", vehicles.slice(0, 3).map((v) => ({
    vin: v.vin,
    name: v.display_name || (v as any).last_state?.vehicle_state?.vehicle_name,
    state: v.state || (v as any).last_state?.state,
  })));

  if (!vehicles.length) {
    console.log("No vehicles found.");
    return;
  }

  const vin = vehicles[0].vin;
  console.log("\nUsing VIN:", vin);

  const state = await client.getVehicleState(vin);
  console.log("State keys:", Object.keys(state).slice(0, 12));

  const battery = await client.getVehicleBattery(vin);
  console.log("Battery summary:", {
    level: (battery as any).battery_level ?? (battery as any).battery_level_percent,
    est_range: (battery as any).est_battery_range ?? (battery as any).range,
    charging_state: (battery as any).charging_state,
  });

  const drives = await client.getDrives(vin, { limit: 5 });
  console.log("Recent drives (up to 5):", drives.map((d: any) => ({
    id: d.id ?? d.import_id,
    start: d.started_at ?? d.start_date,
    end: d.ended_at ?? d.end_date,
    distance_miles: d.odometer_distance ?? d.distance_miles ?? d.distance,
  })));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
