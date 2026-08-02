type RecordData = Record<string, unknown>;
const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : undefined;
const textFields = (record: RecordData, keys: string[]) => keys.map((key) => record[key]).filter((value): value is string => typeof value === "string").join(" ");

export function analyzeDrives(records: unknown[], filters: { origin?: string; destination?: string; sampleLimit?: number } = {}) {
  const origin = filters.origin ? normalize(filters.origin) : undefined;
  const destination = filters.destination ? normalize(filters.destination) : undefined;
  const matched = records.filter((record): record is RecordData => Boolean(record && typeof record === "object" && !Array.isArray(record))).filter((record) => {
    const start = normalize(textFields(record, ["starting_location", "start_address"]));
    const end = normalize(textFields(record, ["ending_location", "end_address"]));
    return (!origin || start.includes(origin)) && (!destination || end.includes(destination));
  });
  const metrics = matched.map((record) => {
    const start = number(record.started_at ?? record.start_date); const end = number(record.ended_at ?? record.end_date);
    return { duration: start !== undefined && end !== undefined && end >= start ? end - start : undefined, distance: number(record.odometer_distance ?? record.distance_miles ?? record.distance), energy: number(record.energy_used), autopilot: number(record.autopilot_distance) };
  });
  const sum = (key: "duration" | "distance" | "energy" | "autopilot") => metrics.reduce((total, item) => total + (item[key] ?? 0), 0);
  const validAverage = (key: "duration" | "distance" | "energy" | "autopilot") => { const values = metrics.map((item) => item[key]).filter((item): item is number => item !== undefined); return values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined; };
  const sampleLimit = Math.max(0, Math.min(filters.sampleLimit ?? 25, 100));
  const sample = matched.slice(0, sampleLimit).map((record) => ({ id: record.id ?? record.import_id, started_at: record.started_at ?? record.start_date, ended_at: record.ended_at ?? record.end_date, start: record.starting_location ?? record.start_address, end: record.ending_location ?? record.end_address, distance_miles: record.odometer_distance ?? record.distance_miles ?? record.distance, energy_used_kwh: record.energy_used, autopilot_distance: record.autopilot_distance, tag: record.tag }));
  return { matchedCount: matched.length, totalDurationSeconds: sum("duration"), averageDurationSeconds: validAverage("duration"), totalDistanceMiles: sum("distance"), averageDistanceMiles: validAverage("distance"), totalEnergyKwh: sum("energy"), averageEnergyKwh: validAverage("energy"), totalAutopilotDistance: sum("autopilot"), averageAutopilotDistance: validAverage("autopilot"), records: sample };
}
