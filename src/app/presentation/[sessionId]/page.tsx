"use client";

import { useState, useEffect } from "react";
import { use } from "react";

interface SlideData {
  id: string;
  imageUrl?: string;
  headline?: string;
  subheadline?: string;
  bullets?: string[];
  backgroundColor?: string;
  source?: "voice" | "question";
}

export default function PresentationPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const [slide, setSlide] = useState<SlideData | null>(null);
  const [sessionValid, setSessionValid] = useState<boolean | null>(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Validate session on mount
  useEffect(() => {
    async function validateSession() {
      try {
        // We'll validate by trying to get feedback (empty response is ok)
        const response = await fetch(`/api/sessions/${sessionId}/feedback`, {
          method: "HEAD",
        });
        setSessionValid(response.ok || response.status === 405); // 405 = method not allowed but endpoint exists
      } catch (error) {
        console.error("Error validating session:", error);
        setSessionValid(false);
      }
    }
    validateSession();
  }, [sessionId]);

  // Listen for slide updates via postMessage (for presenter's own window)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      if (event.data.type === "UPDATE_SLIDE") {
        setSlide(event.data.slide);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Poll for slide updates (for remote audience members)
  useEffect(() => {
    if (!sessionValid) return;

    const pollSlides = async () => {
      try {
        const response = await fetch(`/api/sessions/${sessionId}/slide`);
        if (response.ok) {
          const data = await response.json();
          if (data.slide) {
            setSlide(data.slide);
          }
        }
      } catch (error) {
        console.error("Error polling for slides:", error);
      }
    };

    // Poll immediately on mount
    pollSlides();

    // Then poll every 2 seconds
    const interval = setInterval(pollSlides, 2000);

    return () => clearInterval(interval);
  }, [sessionId, sessionValid]);

  // Handle feedback submission
  const handleSubmitFeedback = async () => {
    if (!feedbackText.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: feedbackText.trim(),
          timestamp: new Date().toISOString(),
        }),
      });

      if (response.ok) {
        setSubmitSuccess(true);
        setFeedbackText("");
        setTimeout(() => {
          setShowFeedbackModal(false);
          setSubmitSuccess(false);
        }, 1500);
      } else {
        alert("Failed to submit question. Please try again.");
      }
    } catch (error) {
      console.error("Error submitting feedback:", error);
      alert("Failed to submit question. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show loading state while validating
  if (sessionValid === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-900">
        <div className="text-center text-zinc-600">
          <div className="mb-4 text-4xl">...</div>
          <p className="text-xl">Loading presentation...</p>
        </div>
      </div>
    );
  }

  // Show error if session is invalid
  if (sessionValid === false) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-900">
        <div className="text-center text-zinc-600">
          <h1 className="mb-4 text-4xl font-bold text-red-400">Session Not Found</h1>
          <p className="text-xl">This presentation session doesn't exist or has expired.</p>
          <p className="mt-4 text-sm text-zinc-700">
            Please check the URL or contact the presenter.
          </p>
        </div>
      </div>
    );
  }

  // Render slide content
  const renderSlide = () => {
    if (!slide) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-zinc-900">
          <div className="text-center text-zinc-600">
            <h1 className="mb-4 text-4xl font-bold text-zinc-400">Slide Quest</h1>
            <p className="text-xl">Waiting for slides...</p>
            <p className="mt-4 text-sm text-zinc-700">
              The presenter will share slides shortly
            </p>
          </div>
        </div>
      );
    }

    // Render image slides
    if (slide.imageUrl) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-black p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slide.imageUrl}
            alt="Presentation Slide"
            className="max-h-[95vh] max-w-full rounded-lg object-contain shadow-2xl"
          />
        </div>
      );
    }

    // Special template for audience question slides
    if (slide.source === "question") {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-blue-600 p-12">
          <div className="max-w-5xl w-full">
            {/* Question Icon and Label */}
            <div className="mb-8 flex items-center justify-center gap-3">
              <svg className="h-12 w-12 text-blue-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-2xl font-semibold uppercase tracking-wider text-blue-200">
                Audience Question
              </span>
            </div>

            {/* Question Text */}
            <div className="rounded-2xl border-4 border-blue-400 bg-white p-12 shadow-2xl">
              <p className="text-center text-4xl font-bold leading-relaxed text-blue-900">
                {slide.headline}
              </p>
            </div>
          </div>
        </div>
      );
    }

    // Render text-based slides (voice-generated)
    if (slide.headline) {
      const bgStyle = slide.backgroundColor?.startsWith("#")
        ? { backgroundColor: slide.backgroundColor }
        : {};
      const bgClass = slide.backgroundColor?.startsWith("#")
        ? ""
        : `bg-${slide.backgroundColor || "zinc"}-800`;

      return (
        <div
          className={`flex min-h-screen flex-col items-center justify-center p-12 ${bgClass}`}
          style={bgStyle}
        >
          <div className="max-w-4xl text-center">
            <h1 className="mb-6 text-5xl font-bold leading-tight text-white">
              {slide.headline}
            </h1>
            {slide.subheadline && (
              <p className="mb-8 text-2xl text-zinc-300">
                {slide.subheadline}
              </p>
            )}
            {slide.bullets && slide.bullets.length > 0 && (
              <ul className="space-y-4 text-left">
                {slide.bullets.map((bullet, i) => (
                  <li key={i} className="flex items-start gap-4 text-xl text-zinc-200">
                    <span className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-zinc-500" />
                    {bullet}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      );
    }

    // Fallback for incomplete slides
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-800 text-zinc-400">
        <p>Slide data incomplete</p>
      </div>
    );
  };

  // Main presentation view
  return (
    <>
      {/* Slide Display */}
      {renderSlide()}

      {/* Floating "Ask a Question" Button */}
      <button
        onClick={() => setShowFeedbackModal(true)}
        className="fixed bottom-6 right-6 rounded-full bg-white px-6 py-3 text-sm font-semibold text-zinc-900 shadow-lg transition-all hover:scale-105 hover:shadow-xl"
      >
        Ask a Question
      </button>

      {/* Feedback Modal */}
      {showFeedbackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-zinc-900 p-6 shadow-2xl">
            {submitSuccess ? (
              <div className="text-center">
                <div className="mb-4 text-5xl">✓</div>
                <h3 className="text-xl font-semibold text-green-400">Question Submitted!</h3>
                <p className="mt-2 text-sm text-zinc-400">
                  The presenter will see your question
                </p>
              </div>
            ) : (
              <>
                <h3 className="mb-4 text-xl font-semibold text-white">Ask a Question</h3>
                <textarea
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="Type your question here..."
                  className="mb-4 h-32 w-full rounded-lg border border-zinc-700 bg-zinc-800 p-3 text-white placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
                  autoFocus
                />
                <div className="flex gap-3">
                  <button
                    onClick={handleSubmitFeedback}
                    disabled={!feedbackText.trim() || isSubmitting}
                    className="flex-1 rounded-lg bg-white px-4 py-2 font-medium text-zinc-900 transition-colors hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? "Submitting..." : "Submit"}
                  </button>
                  <button
                    onClick={() => {
                      setShowFeedbackModal(false);
                      setFeedbackText("");
                    }}
                    className="rounded-lg border border-zinc-700 px-4 py-2 font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
