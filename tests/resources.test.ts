import { expect, it } from "vitest";
import { resourcePath } from "../src/resources.js";

it("maps public resource names to documented Tessie paths", () => {
  expect(resourcePath("historical_states")).toBe("/states");
  expect(resourcePath("consumption")).toBe("/consumption_since_charge");
  expect(resourcePath("license_plate")).toBe("/plate");
});
