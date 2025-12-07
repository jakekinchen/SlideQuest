"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Feedback } from "@/types/feedback";

export function useFeedback(sessionId: string | null) {
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const readFeedbackIdsRef = useRef<Set<string>>(new Set());
  const receivedFeedbackIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    console.log(`Connecting to feedback stream for session ${sessionId}`);

    // Create SSE connection
    const eventSource = new EventSource(`/api/sessions/${sessionId}/stream`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log("Feedback stream connected");
      setIsConnected(true);
      setError(null);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "feedback" && data.payload) {
          const newFeedback = data.payload as Feedback;
          console.log(`Received feedback: "${newFeedback.text.substring(0, 50)}..."`);

          // Prevent duplicates across reconnects/stream glitches
          if (!receivedFeedbackIdsRef.current.has(newFeedback.id)) {
            receivedFeedbackIdsRef.current.add(newFeedback.id);

            setFeedback((prev) => [newFeedback, ...prev]); // Newest first

            // Increment unread count for newly received feedback
            setUnreadCount((prev) => prev + 1);
          }
        }
      } catch (err) {
        console.error("Error parsing feedback event:", err);
      }
    };

    eventSource.onerror = (err) => {
      console.error("Feedback stream error:", err);
      setIsConnected(false);
      setError("Connection lost. Reconnecting...");

      // EventSource will automatically reconnect
      // If it closes, clean up
      if (eventSource.readyState === EventSource.CLOSED) {
        console.log("Stream closed, attempting to reconnect...");
        setError("Connection closed. Refresh to reconnect.");
      }
    };

    // Cleanup on unmount or sessionId change
    return () => {
      console.log("Closing feedback stream");
      eventSource.close();
      eventSourceRef.current = null;
      // Reset tracking so a new session starts clean
      readFeedbackIdsRef.current = new Set();
      receivedFeedbackIdsRef.current = new Set();
      setFeedback([]);
      setUnreadCount(0);
    };
  }, [sessionId]);

  // Mark feedback as read
  const markAsRead = useCallback((feedbackId: string) => {
    readFeedbackIdsRef.current.add(feedbackId);
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  // Mark all feedback as read
  const markAllAsRead = useCallback(() => {
    feedback.forEach((f) => readFeedbackIdsRef.current.add(f.id));
    setUnreadCount(0);
  }, [feedback]);

  // Dismiss (remove) a feedback item
  const dismissFeedback = useCallback((feedbackId: string) => {
    setFeedback((prev) => prev.filter((f) => f.id !== feedbackId));
    // Also remove from read tracking and adjust unread count if needed
    const wasRead = readFeedbackIdsRef.current.delete(feedbackId);
    if (!wasRead) {
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
  }, []);

  // Check if a feedback item is read
  const isRead = useCallback((feedbackId: string) => {
    return readFeedbackIdsRef.current.has(feedbackId);
  }, []);

  return {
    feedback,
    unreadCount,
    isConnected,
    error,
    markAsRead,
    markAllAsRead,
    dismissFeedback,
    isRead,
  };
}
