export function analyzeDrives(records: unknown[], destination?: string) {
  const target = destination?.trim().toLowerCase().replace(/\s+/g, " ");
  const matched = records.filter((record) => {
    const r = record as Record<string, unknown>;
    const text = [r.ending_location, r.end_address].filter((x): x is string => typeof x === "string").join(" ").toLowerCase().replace(/\s+/g, " ");
    return !target || text.includes(target);
  }).map((record) => {
    const r = record as Record<string, unknown>;
    const start = Number(r.started_at ?? r.start_date); const end = Number(r.ended_at ?? r.end_date);
    return { record, durationSeconds: Number.isFinite(start) && Number.isFinite(end) ? end - start : undefined, autopilotDistance: Number(r.autopilot_distance) || 0 };
  });
  const durations = matched.map((x) => x.durationSeconds).filter((x): x is number => x !== undefined && x >= 0);
  return { matchedCount: matched.length, averageDurationSeconds: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : undefined, totalAutopilotDistance: matched.reduce((sum, x) => sum + x.autopilotDistance, 0), records: matched.map((x) => x.record) };
}
