import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("sessionStore", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates and retrieves a session, then expires it based on time", async () => {
    const initialTime = new Date("2025-01-01T00:00:00.000Z");
    vi.setSystemTime(initialTime);

    const { sessionStore } = await import("@/lib/sessionStore");

    const session = sessionStore.createSession();
    expect(session.id).toBeTruthy();

    const fetched = sessionStore.getSession(session.id);
    expect(fetched).not.toBeNull();

    // Move time 5 hours forward (sessions expire after 4 hours)
    const later = new Date(initialTime.getTime() + 5 * 60 * 60 * 1000);
    vi.setSystemTime(later);

    const expired = sessionStore.getSession(session.id);
    expect(expired).toBeNull();
  });

  it("adds feedback and filters by timestamp", async () => {
    const initialTime = new Date("2025-01-01T00:00:00.000Z");
    vi.setSystemTime(initialTime);

    const { sessionStore } = await import("@/lib/sessionStore");

    const session = sessionStore.createSession();

    const first = sessionStore.addFeedback(session.id, "First message");
    expect(first).not.toBeNull();

    const middleTime = new Date(initialTime.getTime() + 1_000);
    vi.setSystemTime(middleTime);

    const second = sessionStore.addFeedback(session.id, "Second message");
    expect(second).not.toBeNull();

    const all = sessionStore.getFeedback(session.id);
    expect(all.length).toBe(2);

    const sinceFirst = sessionStore.getFeedback(
      session.id,
      first!.timestamp,
    );
    expect(sinceFirst.length).toBe(1);
    expect(sinceFirst[0].id).toBe(second!.id);
  });
});

