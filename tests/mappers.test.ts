import {
  toVehicleListItem,
  toStateSummary,
  toBatterySummary,
  toDriveSummary,
} from "../src/mappers.ts";
import {
  TessieBatteryState,
  TessieDrive,
  TessieVehicleState,
  TessieVehicleSummary,
} from "../src/types.ts";

const vin = "5YJ3E1EA7KF317000";

describe("mappers", () => {
  it("maps vehicle list items with fallbacks", () => {
    const summary: TessieVehicleSummary = {
      vin,
      last_state: {
        vehicle_state: { vehicle_name: "Primary" },
        state: "online",
        timestamp: 123,
      },
    };
    const result = toVehicleListItem(summary);
    expect(result.name).toBe("Primary");
    expect(result.status).toBe("online");
    expect(result.last_seen).toBe(123);
  });

  it("maps state summary across nested fields", () => {
    const state: TessieVehicleState = {
      display_name: "Car 1",
      vehicle_state: { vehicle_name: "Car 1", locked: true, sentry_mode: false, odometer: 1000 },
      charge_state: { battery_level: 90, charging_state: "Charging", est_battery_range: 200 },
      drive_state: { latitude: 10, longitude: 20, shift_state: "D", speed: 30 },
      climate_state: { inside_temp: 21, outside_temp: 15, is_climate_on: true },
      timestamp: 123,
    };
    const summary = toStateSummary(vin, state);
    expect(summary.locked).toBe(true);
    expect(summary.location?.latitude).toBe(10);
    expect(summary.climate?.climate_on).toBe(true);
    expect(summary.est_range_miles).toBe(200);
  });

  it("maps battery summary from Tessie fields", () => {
    const battery: TessieBatteryState = {
      battery_level_percent: 82,
      range: 210,
      charging_state: "Disconnected",
      time_to_full_charge: 0,
    };
    const summary = toBatterySummary(vin, battery);
    expect(summary.level).toBe(82);
    expect(summary.estimated_range).toBe(210);
  });

  it("maps drive summary with alternate fields", () => {
    const drive: TessieDrive = {
      import_id: "abc",
      start_date: "2024-01-01T00:00:00Z",
      end_date: "2024-01-01T01:00:00Z",
      start_address: "A",
      end_address: "B",
      distance: 12.5,
      energy_used: 4.2,
      average_speed: 25,
      tag: "trip",
    };
    const summary = toDriveSummary(drive);
    expect(summary.id).toBe("abc");
    expect(summary.distance_miles).toBe(12.5);
    expect(summary.energy_used_kwh).toBe(4.2);
    expect(summary.tag).toBe("trip");
  });
});
