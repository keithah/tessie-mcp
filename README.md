# Tessie MCP Server v2

MCP server rebuilt on the latest developer.tessie.com API. Summary-first tools, composite commands, and live-tested smoke scripts.

## Quickstart
- Install (Smithery recommended): `npx -y @smithery/cli install @keithah/tessie-mcp`
- Set `TESSIE_API_KEY` (<https://dash.tessie.com/settings/api>) in your MCP client or `.env`.
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

## Smithery
- Playground/dev tunnel: `npm run dev` or `npx @smithery/cli dev`
- Transports: stdio (`npm run build:stdio`), shttp (`npm run build:shttp`)
- Docs index: <https://smithery.ai/docs/llms.txt> ; TS quickstart: `npx create-smithery@latest`

## Notes
- API references cached in `docs/llms-full.txt` and `docs/tessie-api-metadata.json` for offline context.
- Uses TypeScript MCP SDK and Tessie HTTPS API; all state stays in Tessie. Undo/confirmation is enforced in `manage_vehicle_command`.
- MCP design references: see `docs/glama-links.md` for glama.ai best-practice articles.
