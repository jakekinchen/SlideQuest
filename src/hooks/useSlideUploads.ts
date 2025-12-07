"use client";

import { useCallback, useState } from "react";
import { convertFilesToImages } from "@/utils/slideConverter";
import type { SlideData } from "@/types/slides";
import type { StyleReference } from "@/types/realtime";

interface UseSlideUploadsOptions {
  appendSlidesToSlidesChannel: (slides: SlideData[]) => void;
  styleReferencesRef: React.MutableRefObject<StyleReference[]>;
}

export function useSlideUploads({
  appendSlidesToSlidesChannel,
  styleReferencesRef,
}: UseSlideUploadsOptions) {
  const [isUploadingSlides, setIsUploadingSlides] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");

  const uploadSlides = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      setIsUploadingSlides(true);
      setUploadProgress("Converting files...");
      console.log("Uploading", files.length, "file(s)");

      try {
        const convertedSlides = await convertFilesToImages(
          files,
          (message, current, total) => {
            setUploadProgress(`${message} (${current}/${total})`);
          }
        );

        if (convertedSlides.length === 0) {
          setUploadProgress("No slides extracted");
          return;
        }

        setUploadProgress(
          `Extracting content from ${convertedSlides.length} slide(s)...`
        );

        const images = convertedSlides.map((slide) => ({
          dataUrl: slide.dataUrl,
          fileName: slide.fileName,
        }));

        const response = await fetch("/api/extract-slides", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ images }),
        });

        if (response.ok) {
          const data = await response.json();
          console.log("Extracted", data.count, "slides");
          if (data.slides && data.slides.length > 0) {
            const slidesWithSource = data.slides.map((s: SlideData) => ({
              ...s,
              source: "slides" as const,
            }));

            appendSlidesToSlidesChannel(slidesWithSource);

            const slidesToUseAsStyle = slidesWithSource.slice(0, 2);
            slidesToUseAsStyle.forEach((slide: SlideData, index: number) => {
              if (styleReferencesRef.current.length < 2) {
                styleReferencesRef.current.push({
                  headline:
                    slide.headline ||
                    slide.originalIdea?.title ||
                    "Uploaded Slide",
                  visualDescription:
                    slide.visualDescription ||
                    slide.originalIdea?.content ||
                    "",
                  category:
                    slide.originalIdea?.category || "uploaded",
                  slideNumber: index + 1,
                });
                console.log(
                  "Set uploaded slide as style reference:",
                  styleReferencesRef.current.length
                );
              }
            });

            setUploadProgress("");
          }
        } else {
          const errorData = await response
            .json()
            .catch(() => ({ error: "Unknown error" }));
          console.error("Failed to extract slides:", errorData);
          setUploadProgress(
            errorData.suggestion ||
              errorData.error ||
              "Failed to extract slides"
          );
        }
      } catch (err) {
        console.error("Upload failed:", err);
        const message = err instanceof Error ? err.message : "Upload failed";
        setUploadProgress(message);
      } finally {
        setIsUploadingSlides(false);
        setTimeout(() => setUploadProgress(""), 3000);
      }
    },
    [appendSlidesToSlidesChannel, styleReferencesRef]
  );

  return {
    isUploadingSlides,
    uploadProgress,
    uploadSlides,
  };
}

