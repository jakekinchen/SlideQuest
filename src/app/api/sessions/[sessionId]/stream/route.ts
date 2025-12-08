/**
 * @fileoverview Server-Sent Events (SSE) endpoint for real-time feedback streaming
 *
 * This endpoint maintains a persistent HTTP connection to push new audience feedback
 * to the presenter in real-time. It uses Server-Sent Events (SSE) instead of WebSockets
 * for simplicity and better compatibility with serverless environments.
 *
 * Endpoint: GET /api/sessions/[sessionId]/stream
 *
 * SSE Protocol:
 * - Content-Type: text/event-stream
 * - Events: { type: "feedback", payload: Feedback }
 * - Keepalive: ":" comment every 15 seconds
 *
 * Architecture decisions:
 * - SSE over WebSockets: Simpler, unidirectional, works better on Vercel/serverless
 * - Polling strategy: Checks for new feedback every 2s (hybrid approach)
 * - Keepalive: Prevents proxy/CDN from closing "idle" connections
 * - Cleanup: Multiple mechanisms to prevent memory leaks
 *
 * Timing rationale:
 * - 2s polling: Balance between latency and database load
 * - 15s keepalive: Standard SSE recommendation (prevents 60s connection timeout)
 *
 * Deployment considerations:
 * - Vercel: nodejs runtime required (edge doesn't support ReadableStream well)
 * - Timeout: May disconnect after 60s on free tier (requires reconnect logic)
 * - Scaling: Each connection holds server resources (consider dedicated real-time service for prod)
 *
 * Memory leak prevention:
 * - Clears intervals on session expiration
 * - Clears intervals on client disconnect (abort signal)
 * - Clears intervals on stream errors
 */

import { NextRequest } from "next/server";
import { sessionStore } from "@/lib/sessionStore";

/**
 * Specifies Node.js runtime for SSE support on Vercel.
 * Edge runtime doesn't handle ReadableStream well for long-lived connections.
 */
export const runtime = "nodejs";

/**
 * GET handler for Server-Sent Events feedback stream.
 *
 * Connection lifecycle:
 * 1. Validates session exists
 * 2. Creates ReadableStream with polling logic
 * 3. Sets up keepalive interval (15s) to prevent connection timeout
 * 4. Polls for new feedback every 2s
 * 5. Sends feedback as SSE events
 * 6. Cleans up intervals on disconnect/error/session expiry
 *
 * Error handling:
 * - Session not found → 404 immediately
 * - Session expires during stream → Close stream gracefully
 * - Client disconnects → Clean up via abort signal
 * - Stream error → Close stream and clear intervals
 *
 * @param request - NextRequest with abort signal for disconnect detection
 * @param params - Route params containing sessionId
 * @returns Response with text/event-stream content type
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  // Validate session exists before opening stream (fail fast)
  const session = sessionStore.getSession(sessionId);
  if (!session) {
    return new Response("Session not found or expired", { status: 404 });
  }

  // TextEncoder for converting strings to Uint8Array for streaming
  const encoder = new TextEncoder();
  /**
   * Tracks timestamp of last feedback check to implement incremental updates.
   * Only sends feedback newer than this timestamp (prevents sending duplicates).
   */
  let lastCheckTimestamp = new Date().toISOString();

  /**
   * ReadableStream implementation for SSE.
   * Uses two setInterval timers: keepalive and polling.
   * Both must be cleaned up to prevent memory leaks.
   */
  const stream = new ReadableStream({
    async start(controller) {
      /**
       * Keepalive interval (15 seconds)
       * Sends SSE comment to prevent connection timeout.
       * Format: ": keepalive\n\n" (SSE ignores lines starting with ":")
       */
      const keepAliveInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch (error) {
          console.error("❌ Error sending keepalive:", error);
          // Stream closed or errored → clean up both intervals
          clearInterval(keepAliveInterval);
          clearInterval(pollInterval);
        }
      }, 15000); // 15 seconds (standard SSE keepalive interval)

      /**
       * Polling interval (2 seconds)
       * Checks sessionStore for new feedback since last check.
       * Hybrid approach: SSE transport + polling data source.
       */
      const pollInterval = setInterval(() => {
        try {
          // Revalidate session exists (it might have expired since stream opened)
          const currentSession = sessionStore.getSession(sessionId);
          if (!currentSession) {
            console.log(`Session ${sessionId} expired, closing stream`);
            clearInterval(keepAliveInterval);
            clearInterval(pollInterval);
            controller.close();
            return;
          }

          // Fetch only new feedback (timestamp-based filtering)
          const newFeedback = sessionStore.getFeedback(sessionId, lastCheckTimestamp);

          if (newFeedback.length > 0) {
            // Send each new feedback item as an SSE event
            for (const feedback of newFeedback) {
              const data = JSON.stringify({
                type: "feedback", // Event type for client-side filtering
                payload: feedback,
              });
              // SSE format: "data: <json>\n\n"
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }
            // Update checkpoint to newest feedback timestamp (incremental updates)
            lastCheckTimestamp = newFeedback[newFeedback.length - 1].timestamp;
          }
        } catch (error) {
          console.error("❌ Error polling feedback:", error);
          // Error occurred → clean up and close stream
          clearInterval(keepAliveInterval);
          clearInterval(pollInterval);
          try {
            controller.close();
          } catch (e) {
            // Stream already closed (ignore error)
          }
        }
      }, 2000); // 2 seconds (balance between latency and server load)

      /**
       * Client disconnect handler (via AbortSignal)
       * Triggered when user closes browser tab or navigates away.
       * Critical for cleanup to prevent resource leaks.
       */
      request.signal.addEventListener("abort", () => {
        console.log(`Client disconnected from session ${sessionId}`);
        clearInterval(keepAliveInterval);
        clearInterval(pollInterval);
        try {
          controller.close();
        } catch (e) {
          // Stream already closed (ignore error)
        }
      });
    },
  });

  // Return Response with SSE headers
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream", // Required for SSE
      "Cache-Control": "no-cache, no-transform", // Prevent proxies from caching/buffering
      Connection: "keep-alive", // Keep HTTP connection open
    },
  });
}
