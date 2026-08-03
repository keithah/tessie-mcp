import { expect, it } from "vitest";
import { isAuthorized } from "../src/auth.js";

it("accepts only its bearer token", () => {
  expect(isAuthorized("Bearer secret", "secret")).toBe(true);
  expect(isAuthorized("Bearer secrex", "secret")).toBe(false);
  expect(isAuthorized(undefined, "secret")).toBe(false);
  expect(isAuthorized("Basic secret", "secret")).toBe(false);
});
