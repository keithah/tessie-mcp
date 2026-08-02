import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

const VIN = /^[A-HJ-NPR-Z0-9]{17}$/i;

export class SettingsStore {
  constructor(private readonly dataDir: string) {}
  private get path() { return join(this.dataDir, "settings.json"); }

  async getDefaultVin(): Promise<string | undefined> {
    try {
      const value: unknown = JSON.parse(await readFile(this.path, "utf8"));
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
    const temporary = `${this.path}.tmp`;
    await writeFile(temporary, JSON.stringify({ defaultVin: vin.toUpperCase() }) + "\n", { mode: 0o600 });
    await rename(temporary, this.path);
  }
}
