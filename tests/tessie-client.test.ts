import { TessieClient } from "../src/tessie-client.ts";

describe("TessieClient guards and bounds", () => {
  it("throws on unexpected listVehicles response shape", async () => {
    const client = new TessieClient("secret");
    (client as any).client = {
      get: jest.fn().mockResolvedValue({ data: { results: "bad" } }),
      post: jest.fn(),
    };

    await expect(client.listVehicles()).rejects.toMatchObject({
      isError: true,
      message: expect.stringContaining("Unexpected response format"),
      details: { context: "listVehicles" },
      retriable: false,
    });
  });

  it("caps drive limit to the maximum allowed", async () => {
    const client = new TessieClient("secret");
    const getMock = jest.fn().mockImplementation((_url: string, { params }: any) => {
      expect(params.limit).toBe(String(100));
      return Promise.resolve({ data: [] });
    });
    (client as any).client = {
      get: getMock,
      post: jest.fn(),
    };

    const res = await client.getDrives("VIN123", { limit: 1000 });
    expect(res).toEqual([]);
  });

  it("caches listVehicles responses until TTL expires", async () => {
    jest.useFakeTimers();
    const client = new TessieClient("secret");
    const getMock = jest.fn().mockResolvedValue({ data: [] });
    (client as any).client = {
      get: getMock,
      post: jest.fn(),
    };

    await client.listVehicles();
    await client.listVehicles();
    expect(getMock).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(31000);
    await client.listVehicles();
    expect(getMock).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it("invalidates caches after sendCommand", async () => {
    const client = new TessieClient("secret");
    const getMock = jest.fn().mockResolvedValue({ data: {} });
    const postMock = jest.fn().mockResolvedValue({ data: {} });
    (client as any).client = {
      get: getMock,
      post: postMock,
    };

    await client.getVehicleState("VIN123");
    await client.getVehicleState("VIN123");
    expect(getMock).toHaveBeenCalledTimes(1);

    await client.sendCommand("VIN123", "lock", {});
    await client.getVehicleState("VIN123");
    expect(getMock).toHaveBeenCalledTimes(2);
  });
});
