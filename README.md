# Tessie MCP Server v2

MCP server rebuilt on the latest developer.tessie.com API. Summary-first tools, composite commands, and live-tested smoke scripts.

## Quickstart
- Install (Smithery recommended): `npx -y @smithery/cli install @keithah/tessie-mcp`
- Set `TESSIE_API_KEY` (<https://dash.tessie.com/settings/api>) in your MCP client or `.env`. In Smithery UI the field appears as `accessToken`.
- Try in a client: “List my vehicles” → `get_active_context`, “Lock VIN ...” → `manage_vehicle_command` with `confirm: true`.

## Tools
- `get_active_context` — vehicle roster with next-step guidance.
- `fetch_vehicle_state` — locks, climate, battery, location snapshot.
- `fetch_vehicle_battery` — charging-focused battery view.
- `search_drives` — recent drives with optional date range.
- `get_driving_path` — coordinate series for mapping/analysis.
- `manage_vehicle_command` — lock/unlock, charging, climate, speed limit, sentry, cabin overheat, seat heat/cool, flash/honk, wake.

### Command safety
Destructive operations require `params.confirm: true`.
```json
{
  "vin": "YOUR_VIN",
  "operation": "lock",
  "params": { "confirm": true }
}
```
Non-destructive actions like `flash_lights` / `honk` skip confirmation.

## Local dev & tests
- Build stdio: `npm run build:stdio`
- Build shttp: `npm run build:shttp` or `npm run build:all`
- Tests: `npm test` (includes command validation)
- Smoke with live Tessie token: `npm run smoke` (raw client), `npm run smoke:tools` (MCP tools)

## Docker
- Build the image: `docker build -t tessie-mcp-server .`
- Run with Compose: `docker compose up --build`
- The HTTP transport listens on `http://localhost:8081/mcp`
- MCP config schema is available at `http://localhost:8081/.well-known/mcp-config`

This containerization only wraps the existing shttp transport. Server configuration and authentication remain the same as the upstream project.

## Smithery
- Playground/dev tunnel: `npm run dev` or `npx @smithery/cli dev`
- Transports: stdio (`npm run build:stdio`), shttp (`npm run build:shttp`, default for publish)
- Docs index: <https://smithery.ai/docs/llms.txt> ; TS quickstart: `npx create-smithery@latest`
- Config schema: `.well-known/mcp-config` (expects `TESSIE_API_KEY`). Server card: `.well-known/mcp.json` (aliases in `.well-known/mcp-server.json` and `.well-known/mcp/server.json`).
- Publish/update: `npm run build:shttp` → `npx @smithery/cli publish` (uses `manifest.json`). Ensure `TESSIE_API_KEY` is provided in user config.

## Notes
- API references cached in `docs/llms-full.txt` and `docs/tessie-api-metadata.json` for offline context.
- Uses TypeScript MCP SDK and Tessie HTTPS API; all state stays in Tessie. Undo/confirmation is enforced in `manage_vehicle_command`.
- MCP design references: see `docs/glama-links.md` for glama.ai best-practice articles.
- Speed-limit operations accept `speed_limit_pin` (sensitive); avoid logging or sharing it.
- Optional debug logging: set `TESSIE_MCP_DEBUG=1` (or `true`) to emit request failures with URLs/status only (no headers/API keys); retry/backoff is built-in for 429/5xx responses.
- Tessie client caches read requests (vehicles, state, battery, drives, paths, historical states) per client instance with short TTLs (15-30s), capped size (200 entries), and VIN-scoped invalidation after commands to avoid stale state while keeping token usage low.
