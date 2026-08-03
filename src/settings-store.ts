import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

const VIN = /^[A-HJ-NPR-Z0-9]{17}$/i;

export class SettingsStore {
  constructor(private readonly dataDir: string) {}
  private get path() { return join(this.dataDir, "settings.json"); }

  async getDefaultVin(): Promise<string | undefined> {
    try {
      let value: unknown;
      try { value = JSON.parse(await readFile(this.path, "utf8")); }
      catch (error) { if (error instanceof SyntaxError) return undefined; throw error; }
      const vin = (value as { defaultVin?: unknown }).defaultVin;
      return typeof vin === "string" && VIN.test(vin) ? vin.toUpperCase() : undefined;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw new Error("Unable to read selected vehicle");
    }
  }

  async setDefaultVin(vin: string): Promise<void> {
    if (!VIN.test(vin)) throw new Error("VIN must be 17 valid VIN characters");
    await mkdir(this.dataDir, { recursive: true });
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify({ defaultVin: vin.toUpperCase() }) + "\n", { mode: 0o600 });
      await rename(temporary, this.path);
    } catch (error) { await rm(temporary, { force: true }); throw error; }
  }
}
