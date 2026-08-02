import { expect, it } from "vitest";
import { commandPath } from "../src/commands.js";
it("requires confirmation for unlock", () => expect(() => commandPath("unlock")).toThrow("confirm: true"));
it("allows wake without confirmation", () => expect(commandPath("wake")).toBe("/command/wake"));
it("rejects arbitrary upstream paths", () => expect(() => commandPath("anything")).toThrow("Unsupported"));
