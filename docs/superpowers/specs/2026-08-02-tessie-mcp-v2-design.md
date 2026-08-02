# Tessie MCP v2 Design

## Goal

Replace the existing Smithery-coupled Tessie MCP server with a reliable, single-user TypeScript MCP service that can run locally or remotely through Cloudflare Tunnel. It should give an LLM a small, clear tool surface while retaining access to Tessie's useful vehicle, driving, charging, and Autopilot/FSD telemetry data.

## Scope

The v2 rewrite removes the existing application implementation and all Smithery-specific source, configuration, build scripts, manifests, and documentation. It also removes custom FSD/range estimation logic: native Tessie data is the source of truth.

Glama metadata, icons, license, and unrelated repository files are not part of the v2 application design and will be evaluated during implementation rather than retained by default.

## Architecture

The service is a standalone TypeScript Node.js application using the MCP SDK's Streamable HTTP transport at `POST /mcp` (and any protocol-required companion HTTP methods). It has no Smithery dependency or transport.

Application layers are deliberately narrow:

1. An HTTP/MCP entry point authenticates callers and manages MCP sessions.
2. A tool layer validates tool input, resolves the selected vehicle, and translates output into MCP content.
3. A Tessie adapter validates request options, calls Tessie's documented API with a bearer token, and maps upstream failures to safe typed errors.
4. A small persisted settings store holds the single user's selected default VIN.

The adapter does not create alternative vehicle analytics, estimates, or a generic arbitrary URL proxy. It exposes Tessie's documented data through typed resource and operation allowlists.

## Authentication and secrets

Two independent environment secrets are required:

- `TESSIE_API_KEY`: Tessie access token, used only by the server when calling `https://api.tessie.com`.
- `MCP_AUTH_TOKEN`: a static token required from an MCP caller as `Authorization: Bearer <token>`.

Neither secret may be stored in source control, emitted in logs, included in MCP tool output, or placed in documentation examples as a real value. Setup documentation instructs the owner how to generate the Tessie token and generate a high-entropy MCP token locally.

Application-level MCP authentication is mandatory in every deployment mode. Cloudflare Tunnel and optional reverse proxies transport traffic; they do not replace this authentication mechanism.

## Default vehicle selection

The server is personal and single-user. `get_vehicle` accepts an optional `vin`.

- When a VIN is passed, it becomes the selected default VIN after the request succeeds.
- When omitted, vehicle-scoped tools use the selected default VIN.
- The selected VIN persists in the mounted `/data` directory across server restarts.
- `DEFAULT_VIN`, if configured, provides the initial fallback. If neither a persisted nor configured default exists, the tool returns an explicit instruction to select a vehicle.

`list_vehicles` never changes the selection. Any tool that allows an explicit VIN follows the same selection behavior only where explicitly documented; the primary selection mechanism is `get_vehicle`.

## MCP tools

The server exposes five model-friendly tools.

### `list_vehicles`

Lists the owner's vehicles with identity and current availability information. It does not alter the selected vehicle.

### `get_vehicle`

Gets a typed Tessie read resource for the selected or explicitly supplied VIN. The `resource` enum keeps a broad API surface behind one tool and includes currently documented personal-use data such as:

- summary/state/status, battery, location, map, weather, tire pressure, consumption, and battery health;
- drives, charges, idles, last idle state, driving path metadata, and historical states;
- driving-assistance fields returned by native Tessie data, including drive `autopilot_distance` and historical-state `autopilot`;
- firmware alerts and license plate when the Tessie account supports them. Account-level charging invoices are excluded from this vehicle-scoped tool.

The input includes only resource-appropriate filters: time windows, pagination/limits, and read-specific options. Outputs preserve Tessie's useful fields with stable, documented wrappers rather than hiding data behind custom summaries.

### `analyze_history`

Runs bounded server-side aggregation over drives, charges, idles, or Autopilot/FSD telemetry. Its default time window is the most recent 90 days; callers can explicitly specify a larger or smaller inclusive window.

For drives it supports origin/destination text filtering and metrics needed for natural-language questions: count, total/average duration, total/average distance, energy, and `autopilot_distance`. Destination matching is normalized, case-insensitive textual matching against Tessie-provided trip location/address fields; the response identifies the matched trips so the model can resolve ambiguity. Historical-state analysis can group native `autopilot` values by elapsed time where timestamps allow it.

This tool enables answers such as average travel time to an address or average weekly hours on the road without returning an unbounded trip history to the model.

### `get_driving_path`

Returns a bounded series of native driving-path coordinates for a requested time window. It rejects or truncates response sizes to a documented maximum and reports the truncation so an LLM can make a smaller follow-up request.

### `vehicle_command`

Provides a typed allowlist of supported personal vehicle commands, configuration changes, and schedules. It never accepts an arbitrary upstream path or payload.

High-impact actions require `confirm: true`: locks/unlocks, trunk/window/tonneau operations, security and driving modes, software updates, and safety/security-sensitive configuration. Low-risk actions may proceed without confirmation: wake, climate convenience controls, lights/honk, and charging convenience controls. Commands that change data invalidate any relevant fresh read state before returning.

Sensitive command fields, including a speed-limit PIN, are omitted from all logs and error messages.

## Autopilot/FSD telemetry

V2 does not infer FSD usage or manufacture FSD estimates. It exposes Tessie's native `autopilot_distance` drive field and `autopilot` historical-state field through `get_vehicle` and `analyze_history`.

Tool descriptions and outputs call this **Autopilot/FSD telemetry** but explicitly avoid claiming that the available fields distinguish FSD from every other Autopilot mode. This matches the current documented Tessie data shape.

## Deployment

`docker-compose.yml` runs the MCP application and binds its HTTP port to `127.0.0.1` by default. It reads an ignored `.env` and mounts a named or bind-backed data volume at `/data`.

Documentation provides four deployment paths:

1. Local-only Docker Compose.
2. A temporary Cloudflare quick tunnel with no token, which supplies an ephemeral public URL.
3. An optional `cloudflared` Compose profile configured with `TUNNEL_TOKEN`, which supplies a stable named tunnel and hostname configured in Cloudflare.
4. Standalone Nginx and Caddy examples for existing reverse-proxy deployments.

The Nginx/Caddy examples must preserve MCP streaming semantics, forward `Authorization`, disable inappropriate response buffering, and set timeouts compatible with long-lived MCP requests. All public paths remain protected by `MCP_AUTH_TOKEN`.

## Errors, logging, and resilience

The server validates all inputs before sending an upstream request. It maps invalid input, absent default vehicle, authentication failure, missing upstream data, rate limiting, and transient upstream errors to actionable MCP errors.

Requests use explicit timeouts and bounded retries only for transient Tessie failures such as 429 and 5xx responses. Read caching is not a v2 requirement; correctness and fresh native Tessie data take precedence over custom caching behavior.

Logs contain request IDs, tool/resource names, non-sensitive status codes, and sanitized error context. They never contain either authentication token, authorization headers, vehicle command secrets, or raw payloads that may contain sensitive information.

## Testing and verification

The rewrite uses a new test suite with no dependence on the existing tests. It covers:

- MCP bearer authentication and unauthorized rejection;
- default-VIN selection, fallback, and persistence across a recreated application instance;
- Tessie API request construction, pagination, time filtering, and error translation;
- input validation and output behavior of every tool;
- the 90-day default analysis window, destination/origin matching, duration aggregation, and native `autopilot_distance` aggregation;
- confirmation requirements for high-impact commands and absence of confirmation for approved low-risk actions;
- end-to-end authenticated Streamable HTTP initialize/list-tools/call-tool flow;
- Docker image build and Compose startup without live Tessie credentials.

An opt-in live smoke command uses an owner-supplied local `TESSIE_API_KEY`. It is read-only by default and does not execute vehicle commands.

## Non-goals

- Smithery support, publishing, manifests, generated wrappers, and Smithery deployment instructions.
- Multi-user accounts, OAuth, per-user Tessie credentials, or a public unauthenticated server.
- Custom FSD/range estimation logic.
- An arbitrary HTTP proxy to Tessie or the internet.
- A database of historical vehicle data beyond the persisted selected VIN.
