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

    jest.advanceTimersByTime(40000); // allow jittered TTL to expire
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

  it("deduplicates concurrent requests for the same key", async () => {
    const client = new TessieClient("secret");
    let resolveFn: () => void = () => {};
    const getMock = jest.fn().mockImplementation(
      () =>
        new Promise<{ data: {} }>((resolve) => {
          resolveFn = () => resolve({ data: {} });
        }),
    );
    (client as any).client = { get: getMock, post: jest.fn() };

    const p1 = client.getVehicleState("VINX");
    const p2 = client.getVehicleState("VINX");
    expect(getMock).toHaveBeenCalledTimes(1);
    resolveFn();
    await Promise.all([p1, p2]);
  });

  it("evicts oldest cache entries when maxCacheSize is exceeded", async () => {
    const client = new TessieClient("secret", { maxCacheSize: 2 });
    const getMock = jest.fn().mockResolvedValue({ data: [] });
    (client as any).client = {
      get: getMock,
      post: jest.fn().mockResolvedValue({ data: {} }),
    };

    await client.listVehicles(); // cache key: vehicles:all
    await client.getVehicleState("VIN1"); // cache key: state:VIN1
    expect((client as any).cache.size).toBe(2);

    await client.getVehicleState("VIN2"); // should evict vehicles cache
    expect((client as any).cache.size).toBe(2);

    await client.listVehicles(); // refetch because evicted
    expect(getMock).toHaveBeenCalledTimes(4);
  });

  it("does not invalidate other VINs with substring matches", async () => {
    const client = new TessieClient("secret");
    const getMock = jest.fn().mockResolvedValue({ data: {} });
    const postMock = jest.fn().mockResolvedValue({ data: {} });
    (client as any).client = { get: getMock, post: postMock };

    await client.getVehicleState("VIN123");
    await client.getVehicleState("VIN1234");
    expect((client as any).cache.has("state:VIN123")).toBe(true);
    expect((client as any).cache.has("state:VIN1234")).toBe(true);

    await client.sendCommand("VIN123", "lock", {});
    expect((client as any).cache.has("state:VIN123")).toBe(false);
    expect((client as any).cache.has("state:VIN1234")).toBe(true);
  });

  it("caches historical states and driving path responses", async () => {
    const client = new TessieClient("secret");
    const getMock = jest.fn().mockResolvedValue({ data: [] });
    (client as any).client = { get: getMock, post: jest.fn() };

    await client.getHistoricalStates("VIN1", { start: "a", end: "b" });
    await client.getHistoricalStates("VIN1", { start: "a", end: "b" });
    await client.getDrivingPath("VIN1", { start: "a", end: "b" });
    await client.getDrivingPath("VIN1", { start: "a", end: "b" });

    expect(getMock).toHaveBeenCalledTimes(2);
  });

  it("rejects wrapped non-array results payloads", async () => {
    const client = new TessieClient("secret");
    (client as any).client = {
      get: jest.fn().mockResolvedValue({ data: { results: { foo: "bar" } } }),
      post: jest.fn(),
    };

    await expect(client.listVehicles()).rejects.toMatchObject({
      isError: true,
      retriable: false,
    });
  });

  it("backs off between retries for retriable errors", async () => {
    jest.useFakeTimers();
    const client = new TessieClient("secret");
    let attempt = 0;
    const getMock = jest.fn().mockImplementation(() => {
      attempt += 1;
      if (attempt < 3) {
        const error: any = new Error("fail");
        error.response = { status: 500 };
        error.isAxiosError = true;
        return Promise.reject(error);
      }
      return Promise.resolve({ data: {} });
    });
    (client as any).client = { get: getMock, post: jest.fn() };
    const timeoutSpy = jest.spyOn(global, "setTimeout");

    const promise = client.getVehicleState("VINX");
    await jest.runOnlyPendingTimersAsync(); // first backoff 500ms
    await jest.runOnlyPendingTimersAsync(); // second backoff 1000ms
    await promise;

    expect(getMock).toHaveBeenCalledTimes(3);
    expect(timeoutSpy.mock.calls[0][1]).toBe(500);
    expect(timeoutSpy.mock.calls[1][1]).toBe(1000);
    jest.useRealTimers();
  });
});
