import { z } from "zod";
import createServer, { getTool } from "../src/index.ts";

describe("manage_vehicle_command validation", () => {
const server = createServer({ config: { TESSIE_API_KEY: "test-key" } });
const tool = getTool(server as any, "manage_vehicle_command");

  const vin = "5YJ3E1EA7KF317000";

  it("requires confirm for destructive operations", async () => {
    const input = tool.inputSchema.parse({
      vin,
      operation: "lock",
      params: { confirm: false },
    });
    const result = await tool.callback(input);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.isError).toBe(true);
    expect(payload.message).toMatch(/Confirmation required/);
  });

  it("returns error payload when flash_lights fails with invalid key", async () => {
    const input = tool.inputSchema.parse({
      vin,
      operation: "flash_lights",
    });
    const result = await tool.callback(input);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.isError).toBe(true);
  });

  it("rejects missing required params for set_charge_limit", async () => {
    const input = tool.inputSchema.parse({
      vin,
      operation: "set_charge_limit",
      params: { confirm: true },
    });
    const result = await tool.callback(input);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.message).toMatch(/charge_limit_percent/);
  });

  it("rejects seat level out of range", async () => {
    const input = tool.inputSchema.parse({
      vin,
      operation: "set_seat_heating",
      params: { seat_position: 0, seat_level: 5, confirm: true },
    });
    const result = await tool.callback(input);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.message).toMatch(/seat_level/);
  });

  it("requires speed_limit_pin for speed limit operations", async () => {
    const input = tool.inputSchema.parse({
      vin,
      operation: "enable_speed_limit",
      params: { confirm: true },
    });
    const result = await tool.callback(input);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.message).toMatch(/speed_limit_pin/);
  });

  it("rejects overheat temp out of range", async () => {
    const input = tool.inputSchema.parse({
      vin,
      operation: "set_cabin_overheat_protection_temp",
      params: { cabin_overheat_temp_c: 5, confirm: true },
    });
    const result = await tool.callback(input);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.message).toMatch(/cabin_overheat_temp_c/);
  });
});
