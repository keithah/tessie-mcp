import { expect, it } from "vitest";
import { buildCommand } from "../src/commands.js";
it("requires confirmation for unlock", () => expect(() => buildCommand("unlock", {})).toThrow("confirm: true"));
it("routes wake to Tessie's dedicated endpoint", () => expect(buildCommand("wake", {})).toMatchObject({ path: "/wake" }));
it("rejects arbitrary upstream paths", () => expect(() => buildCommand("anything", {})).toThrow("Invalid enum"));
it("maps temperature and requires its payload", () => {
  expect(() => buildCommand("set_temperature", {})).toThrow("cabin_temp_c");
  const command = buildCommand("set_temperature", { cabin_temp_c: 20 });
  expect(command.path).toBe("/command/set_temperatures");
  expect(command.body).toEqual({ temperature: 20 });
  expect(buildCommand("lock", { charging_amps: 16 }, true).body).toEqual({});
});
it("requires confirmation for cabin-overheat settings", () => expect(() => buildCommand("set_cop_temp", { cop_temp: 2 })).toThrow("confirm: true"));
