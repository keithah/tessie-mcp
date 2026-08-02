type RecordData = Record<string, unknown>;
type MetricName = "duration" | "distance" | "energy" | "autopilot";
export type HistoryKind = "drives" | "charges" | "idles" | "historical_states";

const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
const asNumber = (value: unknown) => {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};
const asTimestamp = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed / 1000 : undefined;
  }
  return undefined;
};
const fieldsText = (record: RecordData, keys: string[]) => keys
  .map((key) => record[key])
  .filter((value): value is string => typeof value === "string")
  .join(" ");

function matchesLocation(record: RecordData, origin?: string, destination?: string) {
  const start = normalize(fieldsText(record, ["starting_location", "start_address"]));
  const end = normalize(fieldsText(record, ["ending_location", "end_address"]));
  return (!origin || start.includes(normalize(origin))) && (!destination || end.includes(normalize(destination)));
}

function toMetrics(record: RecordData) {
  const start = asTimestamp(record.started_at ?? record.start_date);
  const end = asTimestamp(record.ended_at ?? record.end_date);
  return {
    duration: start !== undefined && end !== undefined && end >= start ? end - start : undefined,
    distance: asNumber(record.odometer_distance ?? record.distance_miles ?? record.distance),
    energy: asNumber(record.energy_used),
    autopilot: asNumber(record.autopilot_distance),
  } satisfies Record<MetricName, number | undefined>;
}

function sumMetric(metrics: Array<Record<MetricName, number | undefined>>, key: MetricName) {
  return metrics.reduce((total, metric) => total + (metric[key] ?? 0), 0);
}
function averageMetric(metrics: Array<Record<MetricName, number | undefined>>, key: MetricName) {
  const values = metrics.map((metric) => metric[key]).filter((value): value is number => value !== undefined);
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : undefined;
}

function projectDrive(record: RecordData) {
  return {
    id: record.id ?? record.import_id,
    started_at: record.started_at ?? record.start_date,
    ended_at: record.ended_at ?? record.end_date,
    start: record.starting_location ?? record.start_address,
    end: record.ending_location ?? record.end_address,
    distance_miles: record.odometer_distance ?? record.distance_miles ?? record.distance,
    energy_used_kwh: record.energy_used,
    autopilot_distance: record.autopilot_distance,
    tag: record.tag,
  };
}

export function analyzeDrives(records: unknown[], filters: { origin?: string; destination?: string; sampleLimit?: number } = {}) {
  const matched = records
    .filter((record): record is RecordData => Boolean(
      record && typeof record === "object" && !Array.isArray(record),
    ))
    .filter((record) => matchesLocation(record, filters.origin, filters.destination));
  const metrics = matched.map(toMetrics);
  const sampleLimit = Math.max(0, Math.min(filters.sampleLimit ?? 25, 100));
  return {
    matchedCount: matched.length,
    totalDurationSeconds: sumMetric(metrics, "duration"),
    averageDurationSeconds: averageMetric(metrics, "duration"),
    totalDistanceMiles: sumMetric(metrics, "distance"),
    averageDistanceMiles: averageMetric(metrics, "distance"),
    totalEnergyKwh: sumMetric(metrics, "energy"),
    averageEnergyKwh: averageMetric(metrics, "energy"),
    totalAutopilotDistance: sumMetric(metrics, "autopilot"),
    averageAutopilotDistance: averageMetric(metrics, "autopilot"),
    records: matched.slice(0, sampleLimit).map(projectDrive),
  };
}

export function analyzeNonDriveHistory(kind: Exclude<HistoryKind, "drives">, records: unknown[], sampleLimit = 25) {
  const result: {
    matchedCount: number;
    records: unknown[];
    autopilotStates?: Record<string, number>;
    autopilotStateDurationSeconds?: Record<string, number>;
  } = { matchedCount: records.length, records: records.slice(0, sampleLimit) };
  if (kind === "historical_states") {
    const states = records.map((item) => {
      const record = item && typeof item === "object" && !Array.isArray(item)
        ? item as RecordData
        : {};
      return {
        state: typeof record.autopilot === "string" ? record.autopilot : "unknown",
        timestamp: asTimestamp(record.timestamp ?? record.created_at ?? record.date ?? record.time),
      };
    });
    result.autopilotStates = states.reduce<Record<string, number>>((counts, item) => {
      counts[item.state] = (counts[item.state] ?? 0) + 1;
      return counts;
    }, {});
    result.autopilotStateDurationSeconds = states.reduce<Record<string, number>>((durations, item, index) => {
      const next = states[index + 1]?.timestamp;
      if (item.timestamp !== undefined && next !== undefined && next >= item.timestamp) {
        durations[item.state] = (durations[item.state] ?? 0) + next - item.timestamp;
      }
      return durations;
    }, {});
  }
  return result;
}
