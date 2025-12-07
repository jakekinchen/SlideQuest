"use client";

import { useCallback, useState } from "react";
import type { SlideData } from "@/types/slides";
import type { SlideHistoryEntry, StyleReference } from "@/types/realtime";

interface AudienceQuestionGateResult {
  accept: boolean;
  reason?: string;
  normalizedQuestion?: string;
  category?: string;
  priority?: "low" | "normal" | "high";
}

interface UseAudienceQuestionsOptions {
  appendAudienceSlide: (slide: SlideData) => void;
  acceptedSlidesRef: React.MutableRefObject<SlideHistoryEntry[]>;
  styleReferencesRef: React.MutableRefObject<StyleReference[]>;
  slideCounterRef: React.MutableRefObject<number>;
}

export function useAudienceQuestions({
  appendAudienceSlide,
  acceptedSlidesRef,
  styleReferencesRef,
  slideCounterRef,
}: UseAudienceQuestionsOptions) {
  const [isAnsweringQuestion, setIsAnsweringQuestion] = useState(false);

  const addToAudienceChannel = useCallback(
    async (
      questionText: string,
      feedbackId: string
    ): Promise<{ accepted: boolean; reason?: string }> => {
      console.log("Processing audience question:", questionText);
      setIsAnsweringQuestion(true);

      try {
        const trimmedQuestion = questionText.trim();
        if (!trimmedQuestion) {
          return { accepted: false, reason: "Empty question text" };
        }

        let gateResult: AudienceQuestionGateResult | null = null;
        try {
          const gateResponse = await fetch("/api/audience-question-gate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              question: trimmedQuestion,
              slideHistory: acceptedSlidesRef.current,
            }),
          });

          if (gateResponse.ok) {
            gateResult =
              (await gateResponse.json()) as AudienceQuestionGateResult;
          } else {
            console.error(
              "Audience question gate error:",
              await gateResponse.text()
            );
          }
        } catch (gateError) {
          console.error("Audience question gate request failed:", gateError);
        }

        if (gateResult && gateResult.accept === false) {
          console.log(
            "Audience question rejected by gate:",
            gateResult.reason
          );
          return {
            accepted: false,
            reason: gateResult.reason || "Question rejected by gate",
          };
        }

        const gatedQuestion =
          (gateResult && gateResult.normalizedQuestion) || trimmedQuestion;

        const answerResponse = await fetch("/api/answer-question", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: gatedQuestion,
            presentationContext: acceptedSlidesRef.current
              .slice(-3)
              .map((s) => `${s.headline}: ${s.visualDescription}`)
              .join("\n"),
          }),
        });

        if (!answerResponse.ok) {
          throw new Error("Failed to get answer");
        }

        const answerData = await answerResponse.json();
        const answer = answerData.answer;

        slideCounterRef.current += 1;
        const currentSlideNumber = slideCounterRef.current;

        const geminiResponse = await fetch("/api/gemini", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slideContent: {
              headline: answer.headline,
              subheadline: answer.subheadline,
              bullets: answer.bullets,
              visualDescription: answer.visualDescription,
              category: answer.category,
              sourceTranscript: `Q: ${gatedQuestion}`,
            },
            styleReferences: styleReferencesRef.current,
            slideNumber: currentSlideNumber,
          }),
        });

        if (!geminiResponse.ok) {
          const errorData = await geminiResponse.json().catch(() => ({}));
          console.error("Gemini error details:", errorData);
          throw new Error(errorData.details || "Failed to generate slide image");
        }

        const geminiData = await geminiResponse.json();

        const answerSlide: SlideData = {
          id: `audience-${feedbackId}`,
          imageUrl: geminiData.slide?.imageUrl,
          headline: answer.headline,
          subheadline: answer.subheadline,
          bullets: answer.bullets,
          visualDescription: answer.visualDescription,
          source: "question",
          originalIdea: {
            title: "Audience Question",
            content: `Q: ${gatedQuestion}`,
            category: gateResult?.category || answer.category || "question",
          },
          timestamp: new Date().toISOString(),
        };

        appendAudienceSlide(answerSlide);
        console.log("Added answered question slide to audience channel");

        return { accepted: true, reason: gateResult?.reason };
      } catch (error) {
        console.error("Failed to process audience question:", error);
        const fallbackSlide: SlideData = {
          id: `audience-${feedbackId}`,
          headline: questionText,
          source: "question",
          originalIdea: {
            title: "Audience Question",
            content: questionText,
            category: "question",
          },
          timestamp: new Date().toISOString(),
        };

        appendAudienceSlide(fallbackSlide);
        return {
          accepted: true,
          reason: "Fallback slide created due to processing error",
        };
      } finally {
        setIsAnsweringQuestion(false);
      }
    },
    [acceptedSlidesRef, appendAudienceSlide, slideCounterRef, styleReferencesRef]
  );

  return {
    isAnsweringQuestion,
    addToAudienceChannel,
  };
}

