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
