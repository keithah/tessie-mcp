export const resources = ["state", "status", "battery", "location", "weather", "tire_pressure", "consumption", "battery_health", "battery_health_measurements", "drives", "charges", "idles", "last_idle_state", "historical_states", "firmware_alerts", "license_plate", "driving_path_metadata"] as const;
export type Resource = (typeof resources)[number];
const paths: Record<Resource, string> = {
  state: "/state", status: "/status", battery: "/battery", location: "/location", weather: "/weather", tire_pressure: "/tire_pressure", consumption: "/consumption_since_charge", battery_health: "/battery_health", battery_health_measurements: "/battery_health", drives: "/drives", charges: "/charges", idles: "/idles", last_idle_state: "/last_idle_state", historical_states: "/states", firmware_alerts: "/firmware_alerts", license_plate: "/plate", driving_path_metadata: "/path",
};
export const timeFilteredResources = new Set<Resource>(["drives", "charges", "idles", "historical_states", "battery_health_measurements", "driving_path_metadata"]);
export function resourcePath(resource: Resource): string { return paths[resource]; }
