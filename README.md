# Tessie MCP

Personal, self-hosted MCP access to Tessie. The server exposes a small set of
LLM-friendly tools over Streamable HTTP and persists the selected vehicle VIN.

## Requirements

- Docker Engine and Docker Compose v2 (recommended), or Node.js 22+
- A Tessie API token from <https://dash.tessie.com/settings/api>
- An MCP bearer token of at least 32 characters

## Configuration

```bash
cp .env.example .env
openssl rand -base64 48
```

Set `TESSIE_API_KEY` and `MCP_AUTH_TOKEN` in `.env`. Optional settings:

- `DEFAULT_VIN`: initial 17-character VIN
- `PORT`: host port (default `3000`)
- `BIND_ADDRESS`: host bind address (default `127.0.0.1`)
- `DATA_DIR`: persistent settings path (default `/data`)
- `TUNNEL_TOKEN`: Cloudflare named-tunnel token

Never commit `.env`; the Tessie token stays on the server.

## Deployment options

### Local-only Docker deployment

```bash
docker compose up -d --build
curl http://127.0.0.1:3000/healthz
```

Configure your MCP client with `http://127.0.0.1:3000/mcp` and the header:

```text
Authorization: Bearer <MCP_AUTH_TOKEN>
```

### LAN deployment

Bind the service to a specific interface and port. This is useful for a client
on another trusted machine on your home network:

```bash
BIND_ADDRESS=0.0.0.0 PORT=3001 docker compose up -d --build
curl http://192.168.42.11:3001/healthz
```

Restrict the port with your firewall when using `0.0.0.0`.

### Temporary Cloudflare Tunnel

Install `cloudflared` on the host, start the app locally, then run:

```bash
cloudflared tunnel --url http://127.0.0.1:3000
```

Use the generated HTTPS URL ending in `/mcp`. The MCP bearer token remains
required.

### Stable Cloudflare named tunnel

Put `TUNNEL_TOKEN` in `.env`, then run the base service with the tunnel
override:

```bash
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d --build
```

The pinned `cloudflared` image runs with `--no-autoupdate`. Configure the tunnel
to forward to `http://tessie-mcp:3000` and use its HTTPS hostname plus `/mcp`.

### Nginx or Caddy

Run Tessie MCP on loopback, then place a reverse proxy in front of it. Preserve
the `Authorization` header, disable response buffering, and use long read
timeouts for streaming:

- Nginx: [examples/nginx.conf](examples/nginx.conf)
- Caddy: [examples/Caddyfile](examples/Caddyfile)

## Tools

- `list_vehicles`: list account vehicles
- `get_vehicle`: read Tessie resources and optionally persist the selected VIN
- `analyze_history`: aggregate drives, charges, idles, and historical
  Autopilot/FSD telemetry over a default 90-day window
- `get_driving_path`: retrieve a bounded native driving path
- `vehicle_command`: run allowlisted commands; high-impact commands require
  `confirm: true`

Autopilot/FSD results use Tessie's native `autopilot_distance` and historical
`autopilot` telemetry. They do not independently prove FSD usage.

## Operations

```bash
docker compose ps
docker compose logs -f tessie-mcp
docker compose restart
docker compose down
```

The named `tessie-mcp-data` volume contains the persisted default VIN. Back it
up before removing volumes. Health is available at `/healthz`; MCP requests are
served at `/mcp`.

## Development

```bash
npm ci
npm run verify
npm run dev
```
