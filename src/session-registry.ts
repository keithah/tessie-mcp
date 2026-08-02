import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

type Entry = { transport: StreamableHTTPServerTransport; touched: number };
export class SessionRegistry {
  private readonly sessions = new Map<string, Entry>();
  private readonly reaper: NodeJS.Timeout;
  constructor(private readonly timeoutMs = 30 * 60 * 1000, intervalMs = 60_000, private readonly maxSessions = 32) {
    this.reaper = setInterval(() => { void this.expire(); }, intervalMs); this.reaper.unref();
  }
  get(id: string) { const entry = this.sessions.get(id); if (entry) entry.touched = Date.now(); return entry?.transport; }
  canAdd() { return this.sessions.size < this.maxSessions; }
  add(id: string, transport: StreamableHTTPServerTransport) { if (!this.canAdd()) throw new Error("MCP session capacity reached"); this.sessions.set(id, { transport, touched: Date.now() }); }
  remove(id: string) { this.sessions.delete(id); }
  async expire() { const cutoff = Date.now() - this.timeoutMs; const expired = [...this.sessions.entries()].filter(([, entry]) => entry.touched < cutoff); expired.forEach(([id]) => this.sessions.delete(id)); await Promise.allSettled(expired.map(([, entry]) => entry.transport.close())); }
  async dispose() { clearInterval(this.reaper); const transports = [...this.sessions.values()].map(({ transport }) => transport); this.sessions.clear(); await Promise.allSettled(transports.map((transport) => transport.close())); }
}
