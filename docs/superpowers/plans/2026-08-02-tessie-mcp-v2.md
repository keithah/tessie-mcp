# Tessie MCP v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Build a standalone authenticated, single-user Tessie MCP v2 service with selected-vehicle persistence and Docker/Cloudflare deployment support.

**Architecture:** A TypeScript MCP Streamable HTTP app authenticates every caller before session handling. Focused configuration, state, Tessie, analysis, command, and tool modules make the server a typed adapter rather than a custom analytics engine or arbitrary proxy.

**Tech Stack:** Node.js 20, TypeScript, MCP SDK, Express, Zod, Node fetch, Vitest, Docker Compose, Cloudflared.

## Global Constraints

- Remove Smithery source, dependencies, configuration, artifacts, manifests, and documentation.
- Keep only five public tools: list_vehicles, get_vehicle, analyze_history, get_driving_path, vehicle_command.
- Require TESSIE_API_KEY only on the server and MCP_AUTH_TOKEN as a bearer token on every MCP request.
- Persist selected VIN in /data. A successful get_vehicle read with vin selects it.
- Default analysis to the most recent 90 days; permit caller-specified ranges.
- Use native autopilot_distance and historical autopilot fields without claiming they distinguish FSD.
- Require confirm: true for high-impact commands only.
- Bind default Compose networking to 127.0.0.1; document quick/named Cloudflare tunnels and Nginx/Caddy.

---

## File structure

- src/config.ts: validated runtime configuration.
- src/auth.ts: timing-safe MCP bearer authentication.
- src/settings-store.ts: atomic persisted default-VIN storage.
- src/tessie-client.ts: typed Tessie fetch client with safe errors and retry.
- src/resources.ts: documented read-resource allowlist and query construction.
- src/analysis.ts: bounded history aggregation.
- src/commands.ts: operation allowlist, payload shaping, confirmation classification.
- src/tools.ts: VIN selection and the five MCP tools.
- src/server.ts and src/index.ts: Streamable HTTP hosting and startup.
- tests/*.test.ts: unit and authenticated transport integration tests.
- Dockerfile, Compose files, reverse-proxy examples, README, and env example: operations.

### Task 1: Replace the legacy scaffold

**Files:**
- Modify: package.json, package-lock.json, tsconfig.json, .gitignore.
- Delete: legacy src, tests, scripts, Smithery files, manifests, Smithery artifacts.
- Create: .env.example, src/config.ts, tests/config.test.ts.

**Interfaces:**
- Produces AppConfig and loadConfig(env).

- [ ] **Step 1: Write the failing test**

~~~ts
import { expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

it("requires both server secrets", () => {
  expect(() => loadConfig({ TESSIE_API_KEY: "tessie" })).toThrow("MCP_AUTH_TOKEN");
});
it("uses safe local defaults", () => {
  expect(loadConfig({ TESSIE_API_KEY: "tessie", MCP_AUTH_TOKEN: "mcp" }))
    .toMatchObject({ port: 3000, dataDir: "/data" });
});
~~~

- [ ] **Step 2: Verify RED**

Run: npm test -- tests/config.test.ts
Expected: failure because config does not exist.

- [ ] **Step 3: Implement the minimum configuration**

~~~ts
export type AppConfig = {
  port: number; tessieApiKey: string; mcpAuthToken: string; dataDir: string; defaultVin?: string;
};
export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  if (!env.TESSIE_API_KEY) throw new Error("TESSIE_API_KEY is required");
  if (!env.MCP_AUTH_TOKEN) throw new Error("MCP_AUTH_TOKEN is required");
  return { port: Number(env.PORT ?? 3000), tessieApiKey: env.TESSIE_API_KEY,
    mcpAuthToken: env.MCP_AUTH_TOKEN, dataDir: env.DATA_DIR ?? "/data", defaultVin: env.DEFAULT_VIN };
}
~~~

Use ESM Node 20 scripts: build=tsc, test=vitest run, start=node dist/index.js. Production dependencies are the MCP SDK, Express, and Zod; development dependencies are TypeScript, Vitest, tsx, and types.

- [ ] **Step 4: Verify GREEN**

Run: npm test -- tests/config.test.ts && npm run build && npm test
Expected: exit 0.

- [ ] **Step 5: Commit**

Run: git add package.json package-lock.json tsconfig.json .gitignore .env.example src/config.ts tests/config.test.ts && git commit -m "chore: scaffold standalone Tessie MCP v2"

### Task 2: Add authenticated persistent vehicle selection

**Files:**
- Create: src/auth.ts, src/settings-store.ts, tests/auth.test.ts, tests/settings-store.test.ts.

**Interfaces:**
- isAuthorized(header, token): boolean.
- SettingsStore.getDefaultVin(): Promise<string | undefined>.
- SettingsStore.setDefaultVin(vin): Promise<void>.
- `resolveVin` in src/tools.ts resolves explicit, persisted, and configured defaults.

- [ ] **Step 1: Write the failing tests**

~~~ts
it("accepts only its bearer token", () => {
  expect(isAuthorized("Bearer secret", "secret")).toBe(true);
  expect(isAuthorized("Bearer wrong", "secret")).toBe(false);
});
it("persists selection across instances", async () => {
  await new SettingsStore(tempDir).setDefaultVin("5YJSA1E26HF000001");
  await expect(new SettingsStore(tempDir).getDefaultVin()).resolves.toBe("5YJSA1E26HF000001");
});
~~~

- [ ] **Step 2: Verify RED**

Run: npm test -- tests/auth.test.ts tests/settings-store.test.ts
Expected: failure because modules do not exist.

- [ ] **Step 3: Implement auth and JSON settings**

Use Buffer lengths plus timingSafeEqual for bearer comparison. Write settings as { defaultVin } to a temporary same-directory file then rename to settings.json. Validate VIN using ^[A-HJ-NPR-Z0-9]{17}$. Resolution order is explicit VIN, persisted VIN, configured DEFAULT_VIN; otherwise raise a selection-required error.

- [ ] **Step 4: Verify GREEN**

Run: npm test -- tests/auth.test.ts tests/settings-store.test.ts && npm test
Expected: exit 0.

- [ ] **Step 5: Commit**

Run: git add src/auth.ts src/settings-store.ts tests && git commit -m "feat: authenticate clients and persist selected vehicle"

### Task 3: Implement Tessie reads and bounded analysis

**Files:**
- Create: src/tessie-client.ts, src/resources.ts, src/analysis.ts, tests/tessie-client.test.ts, tests/resources.test.ts, tests/analysis.test.ts.

**Interfaces:**
- TessieClient.listVehicles(), get(vin, path, query?), post(vin, path, body?).
- resolveResource(resource, input): { path, query }.
- analyzeHistory(kind, records, options): AnalysisResult.

- [ ] **Step 1: Write failing tests**

~~~ts
it("sends the Tessie secret only as an upstream bearer header", async () => {
  await client.get(vin, "/state");
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/state"),
    expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer tessie" }) }));
});
it("defaults drive history to 90 days and averages destination matches", () => {
  const result = analyzeHistory("drives", drives, { destination: "2013 Long Leaf Ct", now });
  expect(result.matchedCount).toBe(2);
  expect(result.averageDurationSeconds).toBe(900);
});
~~~

- [ ] **Step 2: Verify RED**

Run: npm test -- tests/tessie-client.test.ts tests/resources.test.ts tests/analysis.test.ts
Expected: failure because modules do not exist.

- [ ] **Step 3: Implement explicit resource and aggregation behavior**

Base all calls at https://api.tessie.com with a 30-second timeout and at most two retries for 429/5xx GET requests. Redact body and headers from errors/logs. Allow documented vehicle resources: state, status, battery, location, weather, tire_pressure, consumption, battery_health, battery_health_measurements, drives, charges, idles, last_idle_state, historical_states, firmware_alerts, license_plate, and driving_path_metadata. Account-level charging invoices are excluded from this vehicle-scoped tool. Accept only supported time/pagination filters.

For drive analysis: normalize whitespace/case and substring-match destination/origin against Tessie locations; calculate duration from valid timestamps; sum/average distance, energy, and autopilot_distance; report excluded records. For historical states, group the native autopilot string and sum bounded elapsed intervals.

- [ ] **Step 4: Verify GREEN**

Run: npm test -- tests/tessie-client.test.ts tests/resources.test.ts tests/analysis.test.ts && npm run build && npm test
Expected: exit 0.

- [ ] **Step 5: Commit**

Run: git add src/tessie-client.ts src/resources.ts src/analysis.ts tests && git commit -m "feat: add Tessie reads and history analysis"

### Task 4: Register the five tool APIs and command policy

**Files:**
- Create: src/commands.ts, src/tools.ts, tests/commands.test.ts, tests/tools.test.ts.

**Interfaces:**
- buildCommand(operation, input): { path, body?, requiresConfirmation }.
- registerTools(server, dependencies): void.

- [ ] **Step 1: Write failing tests**

~~~ts
it("requires confirmation to unlock", () => {
  expect(() => buildCommand("unlock", {})).toThrow("confirm: true");
});
it("allows wake without confirmation", () => {
  expect(buildCommand("wake", {}).path).toBe("/command/wake");
});
it("registers exactly five public tools", () => {
  registerTools(server, dependencies);
  expect(toolNames(server)).toEqual(["analyze_history", "get_driving_path", "get_vehicle", "list_vehicles", "vehicle_command"]);
});
~~~

- [ ] **Step 2: Verify RED**

Run: npm test -- tests/commands.test.ts tests/tools.test.ts
Expected: failure because modules do not exist.

- [ ] **Step 3: Implement tool schemas and commands**

Register only list_vehicles, get_vehicle, analyze_history, get_driving_path, vehicle_command. An explicit get_vehicle VIN is saved only after its Tessie read succeeds. get_driving_path has a documented maximum point count and reports truncation.

Map all supported personal vehicle commands individually. Require confirmation for locks, trunks, windows, tonneau, security/driving modes, speed-limit controls, firmware updates, and safety/security configuration. Do not require confirmation for wake, climate, flash/honk, start/stop charging, charge limit, or charge amps. Keep sensitive fields out of output and errors.

- [ ] **Step 4: Verify GREEN**

Run: npm test -- tests/commands.test.ts tests/tools.test.ts && npm test
Expected: exit 0.

- [ ] **Step 5: Commit**

Run: git add src/commands.ts src/tools.ts tests && git commit -m "feat: add focused Tessie MCP tools"

### Task 5: Host Streamable HTTP MCP and package deployments

**Files:**
- Create: src/server.ts, src/index.ts, Dockerfile, docker-compose.yml, docker-compose.tunnel.yml, examples/nginx.conf, examples/Caddyfile.
- Modify: README.md, .env.example.

**Interfaces:**
- createApp(dependencies): Express application.
- GET /healthz is public and returns { status: "ok" }.
- Every /mcp protocol method is bearer-authenticated.

- [ ] **Step 1: Write failing transport/deployment tests**

~~~ts
it("rejects unauthenticated MCP initialization", async () => {
  await request(app).post("/mcp").send(initializeRequest).expect(401);
});
it("accepts authenticated MCP initialization", async () => {
  const response = await request(app).post("/mcp").set("Authorization", "Bearer mcp").send(initializeRequest).expect(200);
  expect(response.body.result.protocolVersion).toBeDefined();
});
it("keeps local Compose bound to loopback", () => {
  expect(readFileSync("docker-compose.yml", "utf8")).toContain("127.0.0.1:");
});
~~~

- [ ] **Step 2: Verify RED**

Run: npm test -- tests/server.test.ts tests/deployment.test.ts
Expected: failure because server/deployment files do not exist.

- [ ] **Step 3: Implement transport and delivery assets**

Follow the installed SDK Streamable HTTP server example and create a server/transport per MCP protocol session. Apply bearer middleware before session creation; do not reveal tokens in error payloads. Build a non-root Node 20 multi-stage image. Base Compose mounts /data and exposes loopback only. The tunnel override runs cloudflare/cloudflared as tunnel --no-autoupdate run --token TUNNEL_TOKEN.

Document local Compose, a no-token quick tunnel using cloudflared tunnel --url, stable named tunnels, generation of MCP_AUTH_TOKEN using openssl rand -base64 48, MCP client authorization headers, and Nginx/Caddy proxy settings that forward Authorization, disable buffering, and use long timeouts. The smoke script is read-only and refuses vehicle_command.

- [ ] **Step 4: Verify GREEN**

Run: npm test -- tests/server.test.ts tests/deployment.test.ts && npm run build && npm test && docker build -t tessie-mcp:v2 . && docker compose config && docker compose -f docker-compose.yml -f docker-compose.tunnel.yml config
Expected: every command exits 0 and no command output includes a real secret.

- [ ] **Step 5: Commit**

Run: git add src Dockerfile docker-compose.yml docker-compose.tunnel.yml examples scripts README.md .env.example tests && git commit -m "feat: ship self-hosted Tessie MCP v2"

### Task 6: Verify removal of legacy integration

**Files:**
- Modify: package scripts, README, .gitignore.
- Delete: residual Smithery files and outdated docs.

- [ ] **Step 1: Add failing residue check**

~~~ts
it("has no tracked Smithery integration", () => {
  expect(execFileSync("git", ["grep", "-in", "smithery", "--", ".", ":(exclude)docs/superpowers/**"],
    { encoding: "utf8" })).toBe("");
});
~~~

- [ ] **Step 2: Verify RED**

Run: npm test -- tests/deployment.test.ts
Expected: failure while legacy integration remains.

- [ ] **Step 3: Remove residue and add verification script**

Add npm run verify running npm run build, npm test, and a scoped git grep requiring no Smithery references outside historical superpowers documents.

- [ ] **Step 4: Verify final state**

Run: npm run verify && docker build -t tessie-mcp:v2 . && docker compose config && git status --short
Expected: all verification commands exit 0; only intended v2 changes remain.

- [ ] **Step 5: Commit**

Run: git add -A && git commit -m "refactor: complete Tessie MCP v2 rewrite"

## Plan self-review

- Coverage: Tasks 1–2 provide standalone configuration, authentication, and VIN persistence. Tasks 3–4 provide all five tools, native Autopilot/FSD fields, analysis, and command safety. Task 5 provides authenticated Streamable HTTP plus Docker, Cloudflare, Nginx, Caddy, docs, and smoke coverage. Task 6 removes Smithery and verifies the clean rewrite.
- Consistency: TESSIE_API_KEY, MCP_AUTH_TOKEN, SettingsStore, resolveVehicle, analyzeHistory, and the five public tool names use one spelling throughout.
- Scope: The plan excludes multi-user credentials, OAuth, custom FSD estimates, arbitrary Tessie HTTP forwarding, and a history database.
