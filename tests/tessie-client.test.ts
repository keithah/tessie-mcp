import { expect, it, vi } from "vitest";
import { TessieClient } from "../src/tessie-client.js";

it("serializes vehicle command parameters in the query string", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  await new TessieClient("token", fetcher).post("5YJSA1E26HF000001", "/command/set_charging_amps", { amps: 16 });
  expect(String(fetcher.mock.calls[0]?.[0])).toContain("amps=16");
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
  expect(fetcher.mock.calls[0]?.[1]).not.toHaveProperty("body");
});

it("does not retry a failed vehicle command POST", async () => {
  const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
  await expect(new TessieClient("token", fetcher).post("5YJSA1E26HF000001", "/command/wake")).rejects.toThrow("network");
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("retries transient GET failures", async () => {
  const response = new Response(JSON.stringify({ ok: true }), { status: 200 });
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(response);
  await expect(new TessieClient("token", fetcher).get("5YJSA1E26HF000001", "/state")).resolves.toEqual({ ok: true });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
