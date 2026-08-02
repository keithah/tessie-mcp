# Tessie MCP

Personal, self-hosted MCP access to Tessie. It is a Streamable HTTP server at `/mcp`, designed for one owner and protected by a static bearer token.

## Setup

1. Generate a Tessie access token at <https://dash.tessie.com/settings/api>.
2. Create `.env` from `.env.example` and generate `MCP_AUTH_TOKEN` with `openssl rand -base64 48`.
3. Start the service: `docker compose up -d --build`.
4. Configure an MCP client with URL `http://127.0.0.1:3000/mcp` and header `Authorization: Bearer <MCP_AUTH_TOKEN>`.

`TESSIE_API_KEY` never leaves the server. Passing `vin` to `get_vehicle` selects and persists the default vehicle; later calls can omit it.

## Tools

`list_vehicles`, `get_vehicle`, `analyze_history`, `get_driving_path`, and `vehicle_command`. History analysis defaults to 90 days. Autopilot/FSD values are Tessie's native `autopilot_distance` and historical `autopilot` telemetry; they do not uniquely prove FSD usage.

## Remote access

For a temporary URL without a tunnel token, run the app locally then execute `cloudflared tunnel --url http://127.0.0.1:3000`. For a stable named tunnel, set `TUNNEL_TOKEN` in `.env` and run `docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d`.

The app bearer token remains required even behind Cloudflare.

### Nginx

Use `examples/nginx.conf`; preserve the Authorization header, disable buffering, and use long timeouts.

### Caddy

Use `examples/Caddyfile`; it forwards headers and supports streaming by default.

## Smoke check

`curl http://127.0.0.1:3000/healthz` verifies liveness. The server has no command-line operation that invokes vehicle commands.
