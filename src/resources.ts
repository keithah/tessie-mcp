export const resources = ["state", "status", "battery", "location", "weather", "tire_pressure", "consumption", "battery_health", "battery_health_measurements", "drives", "charges", "idles", "last_idle_state", "historical_states", "firmware_alerts", "license_plate", "charging_invoices", "driving_path_metadata"] as const;
export type Resource = (typeof resources)[number];
export function resourcePath(resource: Resource): string { return `/${resource}`; }
