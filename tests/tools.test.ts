import createServer, { getTool } from "../src/index.ts";
import { TessieBatteryState, TessieDrive, TessieVehicleState, TessieVehicleSummary } from "../src/types.ts";

const vin = "5YJ3E1EA7KF317000";

function makeInvoke(server: any) {
  return async (name: string, params: Record<string, unknown>) => {
    const tool = getTool(server as any, name);
    const parsed = tool.inputSchema?.parse ? tool.inputSchema.parse(params) : params;
    const result = await tool.callback(parsed);
    const text = result.content?.[0]?.text;
    return text ? JSON.parse(text) : result;
  };
}

describe("tool handlers with mocked client", () => {
  const vehicles: TessieVehicleSummary[] = [
    { vin, display_name: "Car 1", state: "online" },
    { vin: "5YJ3E1EA7KF317001", display_name: "Car 2", state: "asleep" },
  ];

  const state: TessieVehicleState = {
    display_name: "Car 1",
    vehicle_state: { vehicle_name: "Car 1", locked: true, sentry_mode: false, odometer: 123 },
    charge_state: { battery_level: 80, charging_state: "Disconnected", est_battery_range: 200 },
    climate_state: { inside_temp: 20, outside_temp: 15, is_climate_on: false },
    drive_state: { latitude: 10, longitude: 20, shift_state: "P", speed: 0 },
    timestamp: Date.now(),
  };

  const battery: TessieBatteryState = {
    battery_level: 75,
    est_battery_range: 180,
    charging_state: "Charging",
    time_to_full_charge: 1.5,
  };

  const drives: TessieDrive[] = [
    { id: 1, started_at: "2024-01-01T00:00:00Z", ended_at: "2024-01-01T01:00:00Z", odometer_distance: 10 },
    { id: 2, started_at: "2024-01-02T00:00:00Z", ended_at: "2024-01-02T01:00:00Z", odometer_distance: 20 },
    { id: 3, started_at: "2024-01-03T00:00:00Z", ended_at: "2024-01-03T01:00:00Z", odometer_distance: 30 },
  ];

  const mockClient = {
    listVehicles: jest.fn().mockResolvedValue(vehicles),
    getVehicleState: jest.fn().mockResolvedValue(state),
    getVehicleBattery: jest.fn().mockResolvedValue(battery),
    getDrives: jest.fn().mockResolvedValue(drives),
    getDrivingPath: jest.fn().mockResolvedValue([]),
    sendCommand: jest.fn().mockResolvedValue({ result: true }),
  };

  const server = createServer({
    config: { TESSIE_API_KEY: "test" },
    client: mockClient as any,
  });
  const invoke = makeInvoke(server);

  it("get_active_context returns mapped vehicles", async () => {
    const res = await invoke("get_active_context", { only_active: false });
    expect(res.vehicles.items.length).toBe(2);
    expect(res.vehicles.items[0].vin).toBe(vin);
  });

  it("fetch_vehicle_state maps summary fields", async () => {
    const res = await invoke("fetch_vehicle_state", { vin });
    expect(res.summary.vehicle).toBe("Car 1");
    expect(res.summary.locked).toBe(true);
    expect(res.summary.battery_level).toBe(80);
  });

  it("fetch_vehicle_battery maps battery summary", async () => {
    const res = await invoke("fetch_vehicle_battery", { vin });
    expect(res.summary.level).toBe(75);
    expect(res.summary.estimated_range).toBe(180);
  });

  it("search_drives truncates to limit", async () => {
    const res = await invoke("search_drives", { vin, limit: 2 });
    expect(res.drives.items.length).toBe(2);
  });
});
