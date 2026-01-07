import axios from "axios";
import { toMcpError } from "../src/errors.ts";

describe("toMcpError", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("maps axios errors without leaking sensitive headers", () => {
    jest.spyOn(axios, "isAxiosError").mockReturnValue(true as any);
    const error = {
      message: "throttled",
      response: { status: 429, statusText: "Too Many Requests" },
      config: { url: "/vehicles", method: "get", headers: { Authorization: "secret" } },
    } as any;

    const result = toMcpError(error, "ctx");
    expect(result.retriable).toBe(true);
    expect(result.suggestion).toMatch(/Back off/);
    expect(result.details?.request).toEqual({ url: "/vehicles", method: "get" });
    expect(result.details?.request).not.toHaveProperty("headers");
  });

  it("returns generic error details for non-axios errors", () => {
    const result = toMcpError(new Error("boom"), "ctx2");
    expect(result.message).toBe("boom");
    expect(result.retriable).toBe(false);
    expect(result.details?.context).toBe("ctx2");
  });
});
