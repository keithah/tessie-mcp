import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { SettingsStore } from "../src/settings-store.js";

it("persists selection across instances", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tessie-mcp-"));
  await new SettingsStore(dir).setDefaultVin("5YJSA1E26HF000001");
  await expect(new SettingsStore(dir).getDefaultVin()).resolves.toBe("5YJSA1E26HF000001");
});
