import { describe, it, expect } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useSlideChannels } from "@/hooks/useSlideChannels";
import type { SlideData } from "@/types/slides";

// Tell React we're in an act-enabled test environment
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

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

describe("useSlideChannels", () => {
  it("adds and retrieves slides in exploratory channel", () => {
    const hook = renderHook(() => useSlideChannels());

    const slide: SlideData = { id: "1", headline: "Test Slide" };

    act(() => {
      hook.result.addToExploratoryChannel(slide);
    });

    expect(hook.result.exploratoryChannel.queue.length).toBe(1);
    expect(hook.result.getChannelSlide("exploratory")?.id).toBe("1");

    hook.unmount();
  });

  it("navigates within a channel and takes slides from it", () => {
    const hook = renderHook(() => useSlideChannels());

    const slide1: SlideData = { id: "1", headline: "First" };
    const slide2: SlideData = { id: "2", headline: "Second" };

    act(() => {
      hook.result.addToExploratoryChannel(slide1);
      hook.result.addToExploratoryChannel(slide2);
    });

    act(() => {
      hook.result.navigateChannel("exploratory", "next");
    });

    expect(hook.result.getChannelSlide("exploratory")?.id).toBeDefined();

    let taken: SlideData | null = null;
    act(() => {
      taken = hook.result.takeSlideFromChannel("exploratory");
    });

    expect(taken).not.toBeNull();
    expect(hook.result.exploratoryChannel.queue.length).toBe(1);

    hook.unmount();
  });

  it("appends and removes uploaded slides", () => {
    const hook = renderHook(() => useSlideChannels());

    const slide1: SlideData = { id: "u1", headline: "Uploaded 1" };
    const slide2: SlideData = { id: "u2", headline: "Uploaded 2" };

    act(() => {
      hook.result.appendSlidesToSlidesChannel([slide1, slide2]);
    });

    expect(hook.result.slidesChannel.queue.length).toBe(2);
    expect(hook.result.getNextUploadedSlide()?.id).toBe("u1");

    act(() => {
      hook.result.removeUploadedSlide("u1");
    });

    expect(hook.result.slidesChannel.queue.length).toBe(1);
    expect(hook.result.slidesChannel.queue[0].id).toBe("u2");

    act(() => {
      hook.result.clearUploadedSlides();
    });

    expect(hook.result.slidesChannel.queue.length).toBe(0);

    hook.unmount();
  });
});
