import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getClientId, isRateLimited } from "@/utils/rateLimit";

describe("getClientId", () => {
  it("prefers x-forwarded-for when present", () => {
    const request = {
      headers: new Headers({
        "x-forwarded-for": "203.0.113.1, 198.51.100.2",
      }),
      ip: "192.0.2.10",
    } as unknown as Parameters<typeof getClientId>[0];

    const clientId = getClientId(request);
    expect(clientId).toBe("203.0.113.1");
  });

  it("falls back to request.ip when header is missing", () => {
    const request = {
      headers: new Headers(),
      ip: "192.0.2.42",
    } as unknown as Parameters<typeof getClientId>[0];

    const clientId = getClientId(request);
    expect(clientId).toBe("192.0.2.42");
  });

  it('returns "unknown" when neither header nor ip are available', () => {
    const request = {
      headers: new Headers(),
      ip: undefined,
    } as unknown as Parameters<typeof getClientId>[0];

    const clientId = getClientId(request);
    expect(clientId).toBe("unknown");
  });
});

describe("isRateLimited", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows up to the limit within the window", () => {
    const key = "client-basic";
    const windowMs = 60_000;
    const limit = 3;

    for (let i = 0; i < limit; i += 1) {
      const limited = isRateLimited(key, limit, windowMs);
      expect(limited).toBe(false);
    }

    const overLimit = isRateLimited(key, limit, windowMs);
    expect(overLimit).toBe(true);
  });

  it("drops old timestamps outside the window", () => {
    const key = "client-window";
    const windowMs = 1_000;
    const limit = 2;

    expect(isRateLimited(key, limit, windowMs)).toBe(false);
    expect(isRateLimited(key, limit, windowMs)).toBe(false);
    expect(isRateLimited(key, limit, windowMs)).toBe(true);

    vi.advanceTimersByTime(1_500);

    const limitedAfterWindow = isRateLimited(key, limit, windowMs);
    expect(limitedAfterWindow).toBe(false);
  });
});
