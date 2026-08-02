import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { isAuthorized } from "./auth.js";
import type { AppConfig } from "./config.js";
import { SettingsStore } from "./settings-store.js";
import { TessieClient } from "./tessie-client.js";
import { registerTools } from "./tools.js";

export function createApp(config: AppConfig) {
  const app = express(); app.use(express.json({ limit: "1mb" }));
  const transports = new Map<string, { transport: StreamableHTTPServerTransport; touched: number }>();
  const sessionTimeoutMs = 30 * 60 * 1000;
  const reaper = setInterval(() => { const now = Date.now(); for (const [id, entry] of transports) if (now - entry.touched > sessionTimeoutMs) { void entry.transport.close(); transports.delete(id); } }, 60_000);
  reaper.unref();
  app.get("/healthz", (_req, res) => res.json({ status: "ok" }));
  app.all("/mcp", async (req, res) => {
    if (!isAuthorized(req.header("authorization"), config.mcpAuthToken)) { res.setHeader("WWW-Authenticate", "Bearer"); res.status(401).json({ error: "Unauthorized" }); return; }
    const sessionId = req.header("mcp-session-id"); let entry = sessionId ? transports.get(sessionId) : undefined; let transport = entry?.transport;
    if (entry) entry.touched = Date.now();
    if (!transport && req.method === "POST" && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({ sessionIdGenerator: randomUUID, onsessioninitialized: (id) => { transports.set(id, { transport: transport!, touched: Date.now() }); } });
      transport.onclose = () => { if (transport?.sessionId) transports.delete(transport.sessionId); };
      const server = new McpServer({ name: "tessie-mcp", version: "3.0.0" });
      registerTools(server, { client: new TessieClient(config.tessieApiKey), store: new SettingsStore(config.dataDir), defaultVin: config.defaultVin });
      await server.connect(transport);
    }
    if (!transport) { res.status(400).json({ error: "Invalid or missing MCP session" }); return; }
    await transport.handleRequest(req, res, req.body);
  });
  return app;
}
