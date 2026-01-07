import { z } from "zod";
import createServer from "../src/index.ts";

describe("manage_vehicle_command validation", () => {
  const server = createServer({ config: { TESSIE_API_KEY: "test-key" } });
  const tool = (server as any)._registeredTools["manage_vehicle_command"];

  it("requires confirm for destructive operations", async () => {
    const input = tool.inputSchema.parse({
      vin: "VIN123",
      operation: "lock",
      params: { confirm: false },
    });
    const result = await tool.callback(input);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.isError).toBe(true);
    expect(payload.message).toMatch(/Confirmation required/);
  });

  it("allows read-safe operations without confirm (flash)", async () => {
    const input = tool.inputSchema.parse({
      vin: "VIN123",
      operation: "flash_lights",
    });
    const result = await tool.callback(input);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.isError).toBe(true);
  });

  it("rejects missing required params for set_charge_limit", async () => {
    const input = tool.inputSchema.parse({
      vin: "VIN123",
      operation: "set_charge_limit",
      params: { confirm: true },
    });
    const result = await tool.callback(input);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.message).toMatch(/charge_limit_percent/);
  });
});
