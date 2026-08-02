import { expect, it } from "vitest";
import { buildCommand } from "../src/commands.js";
it("requires confirmation for unlock", () => expect(() => buildCommand("unlock", {})).toThrow("confirm: true"));
it("allows wake without confirmation", () => expect(buildCommand("wake", {})).toMatchObject({ path: "/command/wake" }));
it("rejects arbitrary upstream paths", () => expect(() => buildCommand("anything", {})).toThrow("Invalid enum"));
