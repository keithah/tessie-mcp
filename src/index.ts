import { loadConfig } from "./config.js";
import { createApp } from "./server.js";
const config = loadConfig();
createApp(config).listen(config.port, "0.0.0.0", () => console.log(`Tessie MCP listening on ${config.port}`));
