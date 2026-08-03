import { expect, it } from "vitest";
import { createApp } from "../src/server.js";

it("protects MCP while leaving health checks public", async () => {
  const server = createApp({ port: 0, tessieApiKey: "tessie", mcpAuthToken: "mcp-token-that-is-at-least-32-chars", dataDir: "/tmp/tessie-mcp-test" }).listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const address = server.address(); const base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  await expect(fetch(`${base}/healthz`).then((response) => response.json())).resolves.toEqual({ status: "ok" });
  await expect(fetch(`${base}/mcp`, { method: "POST", body: "{}", headers: { "content-type": "application/json" } })).resolves.toMatchObject({ status: 401 });
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
