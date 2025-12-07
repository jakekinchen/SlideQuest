import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useFeedback } from "@/hooks/useFeedback";
import type { Feedback } from "@/types/feedback";

// Tell React we're in an act-enabled test environment
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

class MockEventSource {
  static instances: MockEventSource[] = [];

  url: string;
  onopen: ((event: MessageEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  close() {
    // no-op
  }
}

function renderHook<TResult>(render: () => TResult) {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const resultRef: { current: TResult | undefined } = { current: undefined };

  function TestComponent() {
    resultRef.current = render();
    return null;
  }

  const root = createRoot(container);

  act(() => {
    root.render(<TestComponent />);
  });

  return {
    get result() {
      return resultRef.current as TResult;
    },
    unmount() {
      act(() => root.unmount());
      document.body.removeChild(container);
    },
  };
}

describe("useFeedback", () => {
  const OriginalEventSource = globalThis.EventSource;

  beforeAll(() => {
    // @ts-expect-error override for tests
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource;
  });

  afterAll(() => {
    // @ts-expect-error restore original
    globalThis.EventSource = OriginalEventSource;
  });

  beforeEach(() => {
    MockEventSource.instances = [];
  });

  function emitFeedback(
    instance: MockEventSource,
    payload: Feedback,
  ): void {
    const event = {
      data: JSON.stringify({ type: "feedback", payload }),
    } as MessageEvent;
    instance.onmessage?.(event);
  }

  it("tracks feedback and unread count without double-counting duplicates", () => {
    const hook = renderHook(() => useFeedback("session-1"));

    const es = MockEventSource.instances[0];
    expect(es).toBeDefined();

    const feedback: Feedback = {
      id: "f1",
      sessionId: "session-1",
      text: "Hello",
      timestamp: new Date().toISOString(),
    };

    act(() => {
      emitFeedback(es, feedback);
    });

    expect(hook.result.feedback.length).toBe(1);
    expect(hook.result.unreadCount).toBe(1);

    // Emit the same feedback again – should be ignored
    act(() => {
      emitFeedback(es, feedback);
    });

    expect(hook.result.feedback.length).toBe(1);
    expect(hook.result.unreadCount).toBe(1);

    hook.unmount();
  });

  it("decrements unread count when dismissing unread feedback", () => {
    const hook = renderHook(() => useFeedback("session-2"));

    const es = MockEventSource.instances[MockEventSource.instances.length - 1];

    const feedback: Feedback = {
      id: "f2",
      sessionId: "session-2",
      text: "Question?",
      timestamp: new Date().toISOString(),
    };

    act(() => {
      emitFeedback(es, feedback);
    });

    expect(hook.result.feedback.length).toBe(1);
    expect(hook.result.unreadCount).toBe(1);

    act(() => {
      hook.result.dismissFeedback("f2");
    });

    expect(hook.result.feedback.length).toBe(0);
    expect(hook.result.unreadCount).toBe(0);

    hook.unmount();
  });
});
