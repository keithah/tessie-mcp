import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCommandTool, registerHistoryTool, registerPathTool, registerReadTools, type ToolDependencies } from "./tool-handlers.js";

export function registerTools(server: McpServer, dependencies: ToolDependencies) {
  registerReadTools(server, dependencies);
  registerHistoryTool(server, dependencies);
  registerPathTool(server, dependencies);
  registerCommandTool(server, dependencies);
}
