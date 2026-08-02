import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("requires a Tessie API key", () => {
    expect(() => loadConfig({ MCP_AUTH_TOKEN: "mcp" })).toThrow("TESSIE_API_KEY");
  });

  it("requires an MCP auth token", () => {
    expect(() => loadConfig({ TESSIE_API_KEY: "tessie" })).toThrow("MCP_AUTH_TOKEN");
  });

  it("uses safe local defaults", () => {
    expect(loadConfig({ TESSIE_API_KEY: "tessie", MCP_AUTH_TOKEN: "mcp-token-that-is-at-least-32-chars" })).toMatchObject({
      port: 3000,
      dataDir: "/data",
      defaultVin: undefined,
    });
  });
});
