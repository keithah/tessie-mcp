import { loadConfig } from "./config.js";
import { createApp } from "./server.js";
const config = loadConfig();
const httpServer = createApp(config).listen(config.port, "0.0.0.0", () => console.log(`Tessie MCP listening on ${config.port}`));
let shuttingDown = false;
const shutdown = () => { if (shuttingDown) return; shuttingDown = true; httpServer.close((error) => { if (error) process.exitCode = 1; }); };
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
