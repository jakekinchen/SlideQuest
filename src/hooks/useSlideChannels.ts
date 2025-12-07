"use client";

import { useCallback, useState } from "react";
import type { SlideData } from "@/types/slides";

export type ChannelType = "exploratory" | "audience" | "slides";

export interface ChannelState {
  queue: SlideData[];
  currentIndex: number;
}

export type SlideOptions = [SlideData | null, SlideData | null];

const initialChannelState: ChannelState = { queue: [], currentIndex: 0 };

export function useSlideChannels() {
  const [exploratoryChannel, setExploratoryChannel] =
    useState<ChannelState>(initialChannelState);
  const [audienceChannel, setAudienceChannel] = useState<ChannelState>(
    initialChannelState
  );
  const [slidesChannel, setSlidesChannel] = useState<ChannelState>(
    initialChannelState
  );

  const addToExploratoryChannel = useCallback((newSlide: SlideData) => {
    const slideWithSource = { ...newSlide, source: "exploratory" as const };
    setExploratoryChannel((prev) => {
      const currentSlide = prev.queue[prev.currentIndex] ?? null;
      const newQueue = [slideWithSource, ...prev.queue].slice(0, 10);

      const newIndex = currentSlide
        ? Math.max(0, newQueue.findIndex((s) => s.id === currentSlide.id))
        : 0;

      return {
        queue: newQueue,
        currentIndex: newIndex === -1 ? 0 : newIndex,
      };
    });
    console.log("Added slide to exploratory channel");
  }, []);

  const navigateChannel = useCallback(
    (channel: ChannelType, direction: "prev" | "next") => {
      const setChannel =
        channel === "exploratory"
          ? setExploratoryChannel
          : channel === "audience"
          ? setAudienceChannel
          : setSlidesChannel;

      setChannel((prev) => {
        const maxIndex = Math.max(0, prev.queue.length - 1);
        let newIndex = prev.currentIndex;
        if (direction === "prev") {
          newIndex = Math.max(0, prev.currentIndex - 1);
        } else {
          newIndex = Math.min(maxIndex, prev.currentIndex + 1);
        }
        return { ...prev, currentIndex: newIndex };
      });
    },
    []
  );

  const getChannelSlide = useCallback(
    (channel: ChannelType): SlideData | null => {
      const state =
        channel === "exploratory"
          ? exploratoryChannel
          : channel === "audience"
          ? audienceChannel
          : slidesChannel;
      return state.queue[state.currentIndex] || null;
    },
    [exploratoryChannel, audienceChannel, slidesChannel]
  );

  const getChannelInfo = useCallback(
    (channel: ChannelType) => {
      const state =
        channel === "exploratory"
          ? exploratoryChannel
          : channel === "audience"
          ? audienceChannel
          : slidesChannel;
      return {
        total: state.queue.length,
        currentIndex: state.currentIndex,
        canGoPrev: state.currentIndex > 0,
        canGoNext: state.currentIndex < state.queue.length - 1,
      };
    },
    [exploratoryChannel, audienceChannel, slidesChannel]
  );

  const takeSlideFromChannel = useCallback(
    (channel: ChannelType): SlideData | null => {
      const setChannel =
        channel === "exploratory"
          ? setExploratoryChannel
          : channel === "audience"
          ? setAudienceChannel
          : setSlidesChannel;

      const state =
        channel === "exploratory"
          ? exploratoryChannel
          : channel === "audience"
          ? audienceChannel
          : slidesChannel;

      const slide = state.queue[state.currentIndex];
      if (!slide) return null;

      setChannel((prev) => {
        const newQueue = prev.queue.filter((_, i) => i !== prev.currentIndex);
        const newIndex = Math.min(
          prev.currentIndex,
          Math.max(0, newQueue.length - 1)
        );
        return { queue: newQueue, currentIndex: newIndex };
      });

      return slide;
    },
    [exploratoryChannel, audienceChannel, slidesChannel]
  );

  const removeSlideOption = useCallback((id: string) => {
    setExploratoryChannel((prev) => {
      const removedIndex = prev.queue.findIndex((s) => s.id === id);
      const newQueue = prev.queue.filter((s) => s.id !== id);

      let newIndex = prev.currentIndex;
      if (removedIndex !== -1 && removedIndex <= prev.currentIndex) {
        newIndex = Math.max(0, prev.currentIndex - 1);
      }
      newIndex = Math.min(newIndex, Math.max(0, newQueue.length - 1));

      return { queue: newQueue, currentIndex: newIndex };
    });
  }, []);

  const appendAudienceSlide = useCallback((slide: SlideData) => {
    setAudienceChannel((prev) => ({
      ...prev,
      queue: [...prev.queue, slide],
    }));
  }, []);

  const appendSlidesToSlidesChannel = useCallback((slides: SlideData[]) => {
    if (!slides.length) return;
    setSlidesChannel((prev) => ({
      ...prev,
      queue: [...prev.queue, ...slides],
    }));
  }, []);

  const useUploadedSlide = useCallback(
    (slideId: string): SlideData | null => {
      const slide = slidesChannel.queue.find((s) => s.id === slideId);
      if (slide) {
        setSlidesChannel((prev) => {
          const removedIndex = prev.queue.findIndex((s) => s.id === slideId);
          const newQueue = prev.queue.filter((s) => s.id !== slideId);

          let newIndex = prev.currentIndex;
          if (removedIndex !== -1 && removedIndex <= prev.currentIndex) {
            newIndex = Math.max(0, prev.currentIndex - 1);
          }
          newIndex = Math.min(newIndex, Math.max(0, newQueue.length - 1));

          return { queue: newQueue, currentIndex: newIndex };
        });
        return slide;
      }
      return null;
    },
    [slidesChannel]
  );

  const getNextUploadedSlide = useCallback((): SlideData | null => {
    return slidesChannel.queue.length > 0 ? slidesChannel.queue[0] : null;
  }, [slidesChannel]);

  const removeUploadedSlide = useCallback((slideId: string) => {
    setSlidesChannel((prev) => {
      const removedIndex = prev.queue.findIndex((s) => s.id === slideId);
      const newQueue = prev.queue.filter((s) => s.id !== slideId);

      let newIndex = prev.currentIndex;
      if (removedIndex !== -1 && removedIndex <= prev.currentIndex) {
        newIndex = Math.max(0, prev.currentIndex - 1);
      }
      newIndex = Math.min(newIndex, Math.max(0, newQueue.length - 1));

      return { queue: newQueue, currentIndex: newIndex };
    });
  }, []);

  const clearUploadedSlides = useCallback(() => {
    setSlidesChannel(initialChannelState);
  }, []);

  const resetChannels = useCallback(() => {
    setExploratoryChannel(initialChannelState);
    setAudienceChannel(initialChannelState);
    setSlidesChannel(initialChannelState);
  }, []);

  const clearExploratoryChannel = useCallback(() => {
    setExploratoryChannel(initialChannelState);
  }, []);

  const slideOptions: SlideOptions = [
    exploratoryChannel.queue[exploratoryChannel.currentIndex] || null,
    exploratoryChannel.queue[exploratoryChannel.currentIndex + 1] || null,
  ];
  const uploadedSlides = slidesChannel.queue;

  return {
    exploratoryChannel,
    audienceChannel,
    slidesChannel,
    slideOptions,
    uploadedSlides,
    addToExploratoryChannel,
    navigateChannel,
    getChannelSlide,
    getChannelInfo,
    takeSlideFromChannel,
    removeSlideOption,
    appendAudienceSlide,
    appendSlidesToSlidesChannel,
    useUploadedSlide,
    getNextUploadedSlide,
    removeUploadedSlide,
    clearUploadedSlides,
    resetChannels,
    clearExploratoryChannel,
  };
}

