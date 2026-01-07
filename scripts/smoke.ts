import "dotenv/config";
import { TessieClient } from "../src/tessie-client.ts";
import { toBatterySummary, toDriveSummary, toVehicleListItem } from "../src/mappers.ts";

async function main() {
  const apiKey = process.env.TESSIE_API_KEY;
  if (!apiKey) {
    throw new Error("TESSIE_API_KEY missing (set it in .env for smoke test)");
  }

  const client = new TessieClient(apiKey.trim());

  const vehicles = await client.listVehicles({ onlyActive: true });
  const vehicleItems = vehicles.map(toVehicleListItem).slice(0, 3);
  console.log("Vehicles (first 3):", vehicleItems);

  if (!vehicles.length) {
    console.log("No vehicles found.");
    return;
  }

  const vin = vehicles[0].vin;
  console.log("\nUsing VIN:", vin);

  const state = await client.getVehicleState(vin);
  console.log("State keys:", Object.keys(state).slice(0, 12));

  const battery = await client.getVehicleBattery(vin);
  console.log("Battery summary:", toBatterySummary(vin, battery));

  const drives = await client.getDrives(vin, { limit: 5 });
  console.log(
    "Recent drives (up to 5):",
    drives.map((d) => toDriveSummary(d))
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
