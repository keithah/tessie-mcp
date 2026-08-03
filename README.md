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

The MCP token is sent by clients as `Authorization: Bearer <MCP_AUTH_TOKEN>`.
The Tessie API token is used only by this server and is never sent to an MCP
client. Treat both values as secrets and keep `.env` mode `600`.

## What the server provides

The intentionally small tool surface is:

| Tool | Use it for |
| --- | --- |
| `list_vehicles` | Listing vehicles visible to the Tessie account. |
| `get_vehicle` | Reading supported vehicle resources; passing `vin` persists the default VIN. |
| `analyze_history` | Drive, charge, idle, and historical Autopilot/FSD summaries. |
| `get_driving_path` | Getting a bounded native path for a time range. |
| `vehicle_command` | Running allowlisted commands; high-impact commands require confirmation. |

History defaults to the last 90 days. Drive analysis includes duration, distance,
energy, native `autopilot_distance`, and origin/destination filters. Historical
state analysis includes Autopilot state counts and elapsed time derived from
Tessie timestamps. Native telemetry cannot independently prove that every mile
was driven using FSD.

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

### Hermes

Add the MCP server to Hermes' `mcp_servers` configuration:

```yaml
mcp_servers:
  tessie:
    url: https://tessie.example.com/mcp
    headers:
      Authorization: Bearer ${MCP_TESSIE_AUTH_TOKEN}
    connect_timeout: 30
    timeout: 180
    enabled: true
```

Store `MCP_TESSIE_AUTH_TOKEN` in Hermes' protected environment file, restart
the Hermes gateway, and confirm that it registers the five Tessie tools. Do not
put the Tessie API token in Hermes; it belongs only in the server's `.env`.

### Nginx or Caddy

Run Tessie MCP on loopback, then place a reverse proxy in front of it. Preserve
the `Authorization` header, disable response buffering, and use long read
timeouts for streaming:

- Nginx: [examples/nginx.conf](examples/nginx.conf)
- Caddy: [examples/Caddyfile](examples/Caddyfile)

For Nginx, preserve `Authorization`, disable buffering, and use a long
`proxy_read_timeout`. For Caddy, preserve the header and use
`flush_interval -1` so Streamable HTTP responses are not buffered.

## Configure an MCP client

Every client needs a URL ending in `/mcp` and this header:

```text
Authorization: Bearer <MCP_AUTH_TOKEN>
```

Examples:

- Local: `http://127.0.0.1:3000/mcp`
- LAN: `http://<lan-ip>:3001/mcp`
- Reverse proxy or tunnel: `https://<hostname>/mcp`

## First-use examples

Ask your LLM to call `list_vehicles`, then use `get_vehicle` with a VIN. The
selected VIN is persisted, so later questions can omit it:

- “What is my current battery state?”
- “What is my average drive time from home to the office over 90 days?”
- “How many hours per week do I spend on the road?”
- “How many miles have native Autopilot telemetry?”
- “Compare Autopilot and manual elapsed time in historical states.”

## Troubleshooting

- `TESSIE_API_KEY is required`: `.env` is missing or Compose was run elsewhere.
- `MCP_AUTH_TOKEN must be at least 32 characters`: generate a longer token.
- `401 Unauthorized`: check the exact `Authorization: Bearer ...` header.
- A remote client cannot connect: check `BIND_ADDRESS`, firewall rules, proxy headers, and `/mcp`.
- The tunnel stack fails: run both Compose files and set `TUNNEL_TOKEN`.
- The VIN disappears: verify the `tessie-mcp-data` volume and avoid `docker compose down -v`.

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
