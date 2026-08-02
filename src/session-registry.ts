import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

type Entry = { transport: StreamableHTTPServerTransport; touched: number };
export class SessionRegistry {
  private readonly sessions = new Map<string, Entry>();
  private readonly reaper: NodeJS.Timeout;
  constructor(private readonly timeoutMs = 30 * 60 * 1000, intervalMs = 60_000) {
    this.reaper = setInterval(() => { void this.expire(); }, intervalMs); this.reaper.unref();
  }
  get(id: string) { const entry = this.sessions.get(id); if (entry) entry.touched = Date.now(); return entry?.transport; }
  add(id: string, transport: StreamableHTTPServerTransport) { this.sessions.set(id, { transport, touched: Date.now() }); }
  remove(id: string) { this.sessions.delete(id); }
  async expire() { const cutoff = Date.now() - this.timeoutMs; for (const [id, entry] of this.sessions) if (entry.touched < cutoff) { await entry.transport.close(); this.sessions.delete(id); } }
  async dispose() { clearInterval(this.reaper); await Promise.all([...this.sessions.values()].map(({ transport }) => transport.close())); this.sessions.clear(); }
}
