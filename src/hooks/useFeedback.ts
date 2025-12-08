/**
 * @fileoverview Real-time feedback/questions hook using Server-Sent Events (SSE)
 *
 * This hook manages the presenter's view of audience feedback by maintaining
 * a persistent SSE connection to the server. New feedback is pushed in real-time
 * as audience members submit questions.
 *
 * Key features:
 * - Server-Sent Events for real-time push notifications (no polling)
 * - Automatic duplicate prevention (idempotent feedback handling)
 * - Unread count tracking for UI notifications
 * - Automatic reconnection on connection loss
 * - Read/dismiss state management
 *
 * Architecture:
 * - Uses EventSource API (browser-native SSE client)
 * - Maintains feedback in client state (newest first)
 * - Tracks read status in ref (doesn't trigger re-renders)
 * - Cleans up connection on unmount or session change
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Feedback } from "@/types/feedback";

/**
 * Custom hook for receiving real-time audience feedback via Server-Sent Events.
 *
 * Manages the complete feedback lifecycle:
 * 1. Establishes SSE connection when sessionId provided
 * 2. Receives new feedback and updates state (with duplicate prevention)
 * 3. Tracks read/unread status for UI notifications
 * 4. Provides controls for marking as read or dismissing feedback
 *
 * Connection lifecycle:
 * - Opens on mount (if sessionId exists)
 * - Automatically reconnects on temporary failures
 * - Closes on unmount or sessionId change
 *
 * @param sessionId - The presentation session ID, or null if no session active
 *
 * @returns Object containing feedback list, connection state, and control functions
 *
 * @example
 * const { feedback, unreadCount, markAsRead, dismissFeedback } = useFeedback(sessionId);
 *
 * // Display unread count badge
 * {unreadCount > 0 && <Badge>{unreadCount}</Badge>}
 *
 * // Mark as read when user views it
 * <div onClick={() => markAsRead(feedback.id)}>...</div>
 */
export function useFeedback(sessionId: string | null) {
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** EventSource connection for SSE (stored in ref for cleanup) */
  const eventSourceRef = useRef<EventSource | null>(null);
  /**
   * Set of feedback IDs that have been marked as read.
   * Uses ref (not state) to avoid re-renders when marking items read,
   * improving performance when handling many feedback items.
   */
  const readFeedbackIdsRef = useRef<Set<string>>(new Set());

  /**
   * Effect manages SSE connection lifecycle.
   * Re-runs when sessionId changes, closing old connection and opening new one.
   */
  useEffect(() => {
    // No session = no feedback stream needed
    if (!sessionId) {
      setFeedback([]);
      setUnreadCount(0);
      setIsConnected(false);
      return;
    }

    console.log(`📡 Connecting to feedback stream for session ${sessionId}`);

    // Create Server-Sent Events connection (long-lived HTTP connection)
    const eventSource = new EventSource(`/api/sessions/${sessionId}/stream`);
    eventSourceRef.current = eventSource;

    /**
     * Fires when SSE connection opens successfully.
     * EventSource automatically handles reconnection on temporary failures.
     */
    eventSource.onopen = () => {
      console.log("✅ Feedback stream connected");
      setIsConnected(true);
      setError(null);
    };

    /**
     * Handles incoming SSE messages (new feedback from server).
     * Server sends JSON with { type: "feedback", payload: Feedback }.
     */
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "feedback" && data.payload) {
          const newFeedback = data.payload as Feedback;
          console.log(`📝 Received feedback: "${newFeedback.text.substring(0, 50)}..."`);

          setFeedback((prev) => {
            // Duplicate prevention: SSE might send same message twice on reconnect
            if (prev.some((f) => f.id === newFeedback.id)) {
              return prev;
            }
            return [newFeedback, ...prev]; // Add to front (newest first)
          });

          // Increment unread counter (UI shows badge with count)
          setUnreadCount((prev) => prev + 1);
        }
      } catch (err) {
        console.error("Error parsing feedback event:", err);
      }
    };

    /**
     * Handles SSE connection errors and reconnection logic.
     * EventSource automatically attempts to reconnect on transient failures,
     * but if connection is permanently closed, user needs to refresh.
     */
    eventSource.onerror = (err) => {
      console.error("❌ Feedback stream error:", err);
      setIsConnected(false);
      setError("Connection lost. Reconnecting...");

      // Check if connection is permanently closed (vs temporary network issue)
      if (eventSource.readyState === EventSource.CLOSED) {
        console.log("Stream closed, attempting to reconnect...");
        setError("Connection closed. Refresh to reconnect.");
      }
      // Note: EventSource will auto-reconnect if readyState is CONNECTING
    };

    // Cleanup function: close SSE connection on unmount or sessionId change
    return () => {
      console.log("🔌 Closing feedback stream");
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [sessionId]);

  /**
   * Marks a single feedback item as read, decrementing the unread count.
   *
   * @param feedbackId - Unique ID of the feedback to mark as read
   *
   * @example
   * // Mark as read when user clicks to view details
   * <div onClick={() => markAsRead(feedback.id)}>View</div>
   */
  const markAsRead = useCallback((feedbackId: string) => {
    readFeedbackIdsRef.current.add(feedbackId);
    setUnreadCount((prev) => Math.max(0, prev - 1)); // Math.max prevents negative counts
  }, []);

  /**
   * Marks all current feedback items as read, resetting unread count to 0.
   * Useful for "Mark all as read" button functionality.
   *
   * @example
   * <button onClick={markAllAsRead}>Mark All Read</button>
   */
  const markAllAsRead = useCallback(() => {
    feedback.forEach((f) => readFeedbackIdsRef.current.add(f.id));
    setUnreadCount(0);
  }, [feedback]);

  /**
   * Removes a feedback item from the list entirely (not just marking as read).
   * Also removes it from read tracking to free memory.
   *
   * @param feedbackId - Unique ID of the feedback to dismiss/remove
   *
   * @example
   * // Dismiss button to remove feedback from view
   * <button onClick={() => dismissFeedback(feedback.id)}>Dismiss</button>
   */
  const dismissFeedback = useCallback((feedbackId: string) => {
    setFeedback((prev) => prev.filter((f) => f.id !== feedbackId));
    // Clean up read tracking to avoid memory leaks
    readFeedbackIdsRef.current.delete(feedbackId);
  }, []);

  /**
   * Checks if a feedback item has been marked as read.
   *
   * @param feedbackId - Unique ID of the feedback to check
   * @returns true if read, false if unread
   *
   * @example
   * // Show different styling for unread items
   * <div className={isRead(feedback.id) ? "opacity-50" : "font-bold"}>
   */
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
