import { expect, it } from "vitest";
import { analyzeDrives } from "../src/analysis.js";

it("filters origins and returns typed aggregate metrics with a bounded sample", () => {
  const result = analyzeDrives([
    { id: 1, starting_location: "Home", ending_location: "Office", started_at: 0, ended_at: 100, distance_miles: 10, energy_used: 2, autopilot_distance: 4 },
    { id: 2, starting_location: "Other", ending_location: "Office", started_at: 0, ended_at: 200, distance_miles: 20, energy_used: 4, autopilot_distance: 8 },
  ], { origin: "home", sampleLimit: 1 });
  expect(result).toMatchObject({ matchedCount: 1, totalDurationSeconds: 100, averageDistanceMiles: 10, totalAutopilotDistance: 4 });
  expect(result.records).toHaveLength(1);
});

it("parses ISO drive timestamps and aggregates historical state elapsed time", async () => {
  const { analyzeNonDriveHistory } = await import("../src/analysis.js");
  const drives = analyzeDrives([
    { started_at: "2026-08-02T00:00:00Z", ended_at: "2026-08-02T01:00:00Z" },
  ]);
  expect(drives.totalDurationSeconds).toBe(3600);
  const states = analyzeNonDriveHistory("historical_states", [
    { timestamp: "2026-08-02T00:00:00Z", autopilot: "autopilot" },
    { timestamp: "2026-08-02T00:10:00Z", autopilot: "manual" },
    { timestamp: "2026-08-02T00:20:00Z", autopilot: "autopilot" },
  ]);
  expect(states.autopilotStateDurationSeconds).toEqual({ autopilot: 600, manual: 600 });
});
