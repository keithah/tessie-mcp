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
  const transports: Record<string, StreamableHTTPServerTransport> = {};
  app.get("/healthz", (_req, res) => res.json({ status: "ok" }));
  app.all("/mcp", async (req, res) => {
    if (!isAuthorized(req.header("authorization"), config.mcpAuthToken)) { res.status(401).json({ error: "Unauthorized" }); return; }
    const sessionId = req.header("mcp-session-id"); let transport = sessionId ? transports[sessionId] : undefined;
    if (!transport && req.method === "POST" && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({ sessionIdGenerator: randomUUID, onsessioninitialized: (id) => { transports[id] = transport!; } });
      transport.onclose = () => { if (transport?.sessionId) delete transports[transport.sessionId]; };
      const server = new McpServer({ name: "tessie-mcp", version: "3.0.0" });
      registerTools(server, { client: new TessieClient(config.tessieApiKey), store: new SettingsStore(config.dataDir), defaultVin: config.defaultVin });
      await server.connect(transport);
    }
    if (!transport) { res.status(400).json({ error: "Invalid or missing MCP session" }); return; }
    await transport.handleRequest(req, res, req.body);
  });
  return app;
}
