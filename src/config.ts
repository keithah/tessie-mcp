export type AppConfig = {
  port: number;
  tessieApiKey: string;
  mcpAuthToken: string;
  dataDir: string;
  defaultVin?: string;
};

function required(env: NodeJS.ProcessEnv, name: "TESSIE_API_KEY" | "MCP_AUTH_TOKEN"): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer from 1 to 65535");
  }

  return {
    port,
    tessieApiKey: required(env, "TESSIE_API_KEY"),
    mcpAuthToken: required(env, "MCP_AUTH_TOKEN"),
    dataDir: env.DATA_DIR?.trim() || "/data",
    defaultVin: env.DEFAULT_VIN?.trim() || undefined,
  };
}
