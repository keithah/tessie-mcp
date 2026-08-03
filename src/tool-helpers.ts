import { SettingsStore } from "./settings-store.js";
import type { JsonValue } from "./tessie-types.js";

const VIN = /^[A-HJ-NPR-Z0-9]{17}$/i;
export const MAX_PATH_POINTS = 1000;
export const toText = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });

export async function resolveVin(vin: string | undefined, store: SettingsStore, fallback?: string) {
  const selected = vin ?? await store.getDefaultVin() ?? fallback;
  if (!selected) throw new Error("Select a vehicle by passing vin to get_vehicle first");
  if (!VIN.test(selected)) throw new Error("VIN must be 17 valid VIN characters");
  return selected.toUpperCase();
}

export function parseDateRange(start?: string, end?: string, defaultDays = 90) {
  const begin = start ?? new Date(Date.now() - defaultDays * 86400000).toISOString();
  const finish = end ?? new Date().toISOString();
  const from = Math.floor(Date.parse(begin) / 1000); const to = Math.floor(Date.parse(finish) / 1000);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) throw new Error("start and end must be valid dates with end after start");
  return { begin, finish, from, to };
}

export function readResults(raw: JsonValue): JsonValue[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object" && !Array.isArray(raw) && Array.isArray(raw.results)) return raw.results;
  return [];
}
