import { loadConfig } from "./config.js";
import { createApp } from "./server.js";
const config = loadConfig();
const app = createApp(config);
const httpServer = app.listen(config.port, "0.0.0.0", () => console.info(JSON.stringify({ event: "server_started", port: config.port })));
let shuttingDown = false;
const shutdown = () => { if (shuttingDown) return; shuttingDown = true; void app.locals.sessionRegistry.dispose(); httpServer.close((error) => { if (error) process.exitCode = 1; }); };
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
