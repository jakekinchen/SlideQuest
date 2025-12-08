/**
 * @fileoverview Real-time voice transcription and slide generation hook
 *
 * This hook manages the complete lifecycle of voice-to-slide conversion using:
 * - Deepgram SDK for live speech-to-text transcription
 * - MediaRecorder API for audio capture
 * - Gemini API integration for AI slide generation
 *
 * Key features:
 * - Real-time audio transcription with Deepgram
 * - Transcript accumulation strategy (prevents duplicate slides on pauses)
 * - Slide queue management (pending slides awaiting presenter approval)
 * - Audience question slide generation
 * - Connection lifecycle management (start, stop, cleanup)
 *
 * Architecture decisions:
 * - Uses refs (not state) for transcript accumulation to avoid re-renders
 * - Accumulates full transcript during recording, processes only on stop
 * - Manages MediaRecorder, MediaStream, and Deepgram connection cleanup
 */

"use client";

import { useCallback, useRef, useState } from "react";
import {
  createClient,
  LiveTranscriptionEvents,
  type LiveTranscriptionEvent,
} from "@deepgram/sdk";

/**
 * Represents a presentation slide with various display formats and source tracking.
 * Slides can originate from voice input, PDF uploads, or audience questions.
 */
export interface SlideData {
  /** Unique identifier (UUID) */
  id: string;
  /** Base64 data URL for PDF-sourced image slides */
  imageUrl?: string;
  /** Main headline text for AI-generated or question slides */
  headline?: string;
  /** Subtitle providing context or categorization */
  subheadline?: string;
  /** Bullet point list for text-based slides */
  bullets?: string[];
  /** Background color (hex code or CSS color name) */
  backgroundColor?: string;
  /** Original voice transcript or question that generated this slide */
  originalIdea: {
    title: string;
    content: string;
    category: string;
  };
  /** ISO 8601 timestamp of slide creation */
  timestamp: string;
  /** Source type: "voice" for voice-generated, "question" for audience questions */
  source?: "voice" | "question";
}

/**
 * Custom hook for real-time voice transcription and AI slide generation.
 *
 * Manages the complete workflow of converting speech to presentation slides:
 * 1. User clicks "Record" → Microphone access requested
 * 2. Audio streamed to Deepgram → Real-time transcription
 * 3. User clicks "Stop" → Full transcript sent to Gemini API
 * 4. AI-generated slide added to pending queue → Awaits presenter approval
 *
 * State management architecture:
 * - `fullTranscriptRef`: Ref (not state) to accumulate transcript without re-renders
 * - `transcript`: State for UI display of current/interim transcription
 * - `pendingSlides`: Queue of slides awaiting presenter approval
 * - `connectionRef`, `mediaStreamRef`, `recorderRef`: Refs for cleanup on unmount
 *
 * @returns Object containing state, controls, and slide management functions
 *
 * @example
 * const { isRecording, transcript, pendingSlides, start, stop } = useRealtimeAPI();
 *
 * // Start recording
 * await start();
 *
 * // Stop and process
 * await stop(); // Generates slide from accumulated transcript
 */
export function useRealtimeAPI() {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [pendingSlides, setPendingSlides] = useState<SlideData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);

  type DeepgramLiveConnection = ReturnType<
    ReturnType<typeof createClient>["listen"]["live"]
  >;

  // Refs for cleanup and transcript accumulation (don't trigger re-renders)
  /** Deepgram WebSocket connection for live transcription */
  const connectionRef = useRef<DeepgramLiveConnection | null>(null);
  /** User's microphone MediaStream for cleanup on stop */
  const mediaStreamRef = useRef<MediaStream | null>(null);
  /** MediaRecorder instance for capturing audio chunks */
  const recorderRef = useRef<MediaRecorder | null>(null);
  /**
   * Accumulated transcript from all final utterances during recording session.
   * Uses ref instead of state to avoid re-renders on every transcript update,
   * which would cause performance issues during real-time transcription.
   */
  const fullTranscriptRef = useRef<string>("");

  /**
   * Sends a voice transcript to the Gemini API to generate a slide.
   * Called automatically when recording stops with accumulated transcript.
   *
   * @param title - Brief title extracted from transcript (first 6 words)
   * @param content - Full transcript text
   * @param category - Slide category (e.g., "concept", "data", "quote")
   *
   * @example
   * await processIdea("Climate change effects", "Climate change is causing...", "concept");
   */
  const processIdea = useCallback(
    async (title: string, content: string, category: string) => {
      console.log("🎯 Processing idea:", { title, content, category });
      setIsProcessing(true);

      try {
        const response = await fetch("/api/gemini", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, content, category }),
        });

        if (response.ok) {
          const data = await response.json();
          console.log("✅ Gemini response:", data);
          if (data.slide) {
            // Mark slide as voice-generated
            const slideWithSource = { ...data.slide, source: "voice" as const };
            setPendingSlides((prev) => [slideWithSource, ...prev]);
          }
        } else {
          console.error("❌ Gemini API error:", await response.text());
        }
      } catch (err) {
        console.error("❌ Failed to generate slide:", err);
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  /**
   * Removes a slide from the pending queue (when presenter skips/rejects it).
   *
   * @param id - Unique identifier of the slide to remove
   */
  const removeSlide = useCallback((id: string) => {
    setPendingSlides((prev) => prev.filter((s) => s.id !== id));
  }, []);

  /**
   * Adds multiple slides to the pending queue (typically from PDF upload).
   *
   * @param slides - Array of slides to append to pending queue
   */
  const addSlides = useCallback((slides: SlideData[]) => {
    setPendingSlides((prev) => [...prev, ...slides]);
  }, []);

  /**
   * Starts voice recording and real-time transcription session.
   *
   * Workflow:
   * 1. Validates NEXT_PUBLIC_DEEPGRAM_API_KEY environment variable
   * 2. Creates Deepgram WebSocket connection (nova-3 model, US English)
   * 3. Requests microphone access from user
   * 4. Sets up MediaRecorder to stream audio chunks to Deepgram
   * 5. Configures event listeners for transcript updates
   *
   * Transcript handling:
   * - Final utterances: Accumulated in `fullTranscriptRef` (not shown live)
   * - Interim results: Displayed in UI via `setTranscript` state
   * - This prevents creating multiple slides when user pauses mid-sentence
   *
   * @throws Sets error state if API key missing or microphone access denied
   *
   * @example
   * await start(); // Begins recording, shows interim transcript to user
   */
  const start = useCallback(async () => {
    if (connectionRef.current) return;

    const apiKey = process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY;

    if (!apiKey) {
      setError("Missing NEXT_PUBLIC_DEEPGRAM_API_KEY environment variable");
      return;
    }

    setError(null);
    // Reset transcript for new recording session (clear any previous transcript data)
    fullTranscriptRef.current = "";
    setTranscript("");

    // Initialize Deepgram client with nova-3 model (highest accuracy for live transcription)
    const deepgram = createClient(apiKey);
    const connection = deepgram.listen.live({
      model: "nova-3", // Latest Deepgram model for English
      language: "en-US",
      smart_format: true, // Automatic punctuation and formatting
    });

    connectionRef.current = connection;

    connection.on(LiveTranscriptionEvents.Open, async () => {
      console.log("🔌 Deepgram connection opened");
      setIsConnected(true);

      try {
        // Request microphone access from browser (triggers permission prompt)
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;

        // Set up MediaRecorder with WebM/Opus (efficient codec for voice)
        const recorder = new MediaRecorder(stream, {
          mimeType: "audio/webm;codecs=opus", // Opus is optimized for speech
        });
        recorderRef.current = recorder;

        // Stream audio chunks to Deepgram as they become available
        recorder.ondataavailable = async (event) => {
          if (!event.data || event.data.size === 0) return;
          const current = connectionRef.current;
          if (!current) return;

          try {
            const buffer = await event.data.arrayBuffer();
            current.send(buffer);
          } catch (err) {
            console.error("❌ Failed to send audio chunk to Deepgram:", err);
          }
        };

        // Start recording with 250ms chunks (balances latency vs processing overhead)
        recorder.start(250);
        setIsRecording(true);
      } catch (err) {
        console.error("❌ Microphone access denied or failed:", err);
        setError("Microphone access denied");
        connection.requestClose();
        connectionRef.current = null;
        setIsConnected(false);
      }
    });

    /**
     * Handles incoming transcription results from Deepgram.
     *
     * Key insight: Deepgram sends two types of results:
     * 1. Interim results: Real-time, low-confidence partial transcripts
     * 2. Final results: High-confidence complete sentences (is_final or speech_final)
     *
     * Strategy: Only accumulate final results in fullTranscriptRef to prevent
     * duplicate slide generation when user pauses. Show interim in UI for feedback.
     */
    connection.on(
      LiveTranscriptionEvents.Transcript,
      (data: LiveTranscriptionEvent) => {
        const alt = data.channel.alternatives[0];
        const text = alt?.transcript?.trim();
        if (!text) return;

        // When Deepgram marks the segment as final, add it to the accumulated transcript
        if (data.is_final || data.speech_final) {
          // Accumulate final transcripts (won't create slide until stop() is called)
          fullTranscriptRef.current = fullTranscriptRef.current
            ? `${fullTranscriptRef.current} ${text}`
            : text;

          // Update the UI display with the accumulated transcript
          setTranscript(fullTranscriptRef.current);
        } else {
          // Show interim results in UI (preview what's being captured, not saved yet)
          setTranscript(
            fullTranscriptRef.current
              ? `${fullTranscriptRef.current} ${text}`
              : text
          );
        }
      }
    );

    connection.on(LiveTranscriptionEvents.Error, (err) => {
      console.error("❌ Deepgram connection error:", err);
      setError("Deepgram connection error");
      setIsConnected(false);
      setIsRecording(false);
    });

    connection.on(LiveTranscriptionEvents.Close, () => {
      console.log("🔌 Deepgram connection closed");
      setIsConnected(false);
      setIsRecording(false);
    });
  }, [processIdea]);

  /**
   * Stops voice recording, cleans up resources, and generates slide from transcript.
   *
   * Cleanup workflow:
   * 1. Stops MediaRecorder (ends audio capture)
   * 2. Stops all MediaStream tracks (releases microphone)
   * 3. Closes Deepgram WebSocket connection
   * 4. Clears UI transcript display
   *
   * Slide generation:
   * - If transcript is >10 characters, sends to Gemini API
   * - Extracts title from first 6 words of transcript
   * - Generated slide appears in pending queue for presenter approval
   *
   * @example
   * await stop(); // Stops recording and generates slide if transcript exists
   */
  const stop = useCallback(async () => {
    // Capture the accumulated transcript before clearing refs (needs to survive cleanup)
    const finalTranscript = fullTranscriptRef.current;

    // Stop MediaRecorder if still active (won't throw error if already stopped)
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;

    // Release microphone access (important for user privacy and browser indicator)
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    // Close Deepgram WebSocket connection gracefully
    if (connectionRef.current) {
      connectionRef.current.requestClose();
      connectionRef.current = null;
    }

    setIsConnected(false);
    setIsRecording(false);
    setTranscript(""); // Clear UI display

    // Process the accumulated transcript into a slide (only if meaningful length)
    if (finalTranscript && finalTranscript.trim().length > 10) {
      console.log("🎯 Processing recorded slide idea:", finalTranscript);
      // Extract first 6 words as a simple title
      const words = finalTranscript.split(/\s+/);
      const title = words.slice(0, 6).join(" ");
      await processIdea(title, finalTranscript, "concept");
    }

    // Reset the transcript ref for next recording session
    fullTranscriptRef.current = "";
  }, [processIdea]);

  /**
   * Clears all pending slides from the queue.
   * Used when presenter wants to start fresh or skip all queued slides.
   */
  const clearPending = useCallback(() => {
    setPendingSlides([]);
  }, []);

  /**
   * Converts an audience feedback/question into a presentation slide.
   * Creates a standardized blue slide template for audience questions.
   *
   * Unlike voice-generated slides, these use a fixed template (no AI generation)
   * with the question as the headline and "Audience Question" as subtitle.
   *
   * @param feedbackId - Unique ID of the feedback (for tracking/logging)
   * @param questionText - The audience member's question text
   *
   * @example
   * await processFeedback("abc123", "How does this affect performance?");
   */
  const processFeedback = useCallback(
    async (feedbackId: string, questionText: string) => {
      console.log("🎯 Processing feedback:", { feedbackId, questionText });
      setIsProcessing(true);

      try {
        // Create a standardized template slide for audience questions (no AI needed)
        const questionSlide: SlideData = {
          id: crypto.randomUUID(),
          headline: questionText,
          subheadline: "Audience Question",
          backgroundColor: "#2563eb", // Blue background for audience questions
          originalIdea: {
            title: "Audience Question",
            content: questionText,
            category: "question",
          },
          timestamp: new Date().toISOString(),
          source: "question" as const,
        };

        console.log("✅ Created question slide template:", questionSlide);
        setPendingSlides((prev) => [...prev, questionSlide]);
      } catch (err) {
        console.error("❌ Failed to generate Q&A slide:", err);
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  return {
    isConnected,
    isRecording,
    isProcessing,
    pendingSlides,
    error,
    transcript,
    start,
    stop,
    clearPending,
    removeSlide,
    addSlides,
    processFeedback,
  };
}
