/**
 * @fileoverview Audience feedback submission API endpoint
 *
 * Allows audience members to submit questions or feedback during a presentation.
 * Feedback is stored in sessionStore and pushed to the presenter via SSE stream.
 *
 * Endpoint: POST /api/sessions/[sessionId]/feedback
 *
 * Request: {
 *   text: string  // Feedback/question text (required, non-empty)
 * }
 *
 * Response: {
 *   success: boolean,
 *   feedbackId: string  // Unique ID for the submitted feedback
 * }
 *
 * Security considerations:
 * - No authentication: Anyone with session ID can submit feedback
 * - No rate limiting: Vulnerable to spam (should add in production)
 * - No input sanitization: XSS risk if feedback displayed without escaping
 * - Text length unlimited: Could cause memory issues with very long strings
 */

import { NextRequest, NextResponse } from "next/server";
import { sessionStore } from "@/lib/sessionStore";

/**
 * POST handler for submitting audience feedback/questions.
 *
 * Validation:
 * - Session must exist and not be expired
 * - Text field required and non-empty after trimming
 * - Text must be a string
 *
 * Workflow:
 * 1. Validates session exists
 * 2. Validates feedback text
 * 3. Adds feedback to sessionStore (with auto-generated ID and timestamp)
 * 4. Returns feedback ID for tracking
 *
 * @param request - NextRequest with JSON body containing text field
 * @param params - Route params containing sessionId
 * @returns NextResponse with success status and feedbackId
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    // Validate session exists (fail early if session expired or invalid)
    const session = sessionStore.getSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: "Session not found or expired" },
        { status: 404 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { text } = body;

    // Validate feedback text (non-empty string required)
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json(
        { error: "Feedback text is required" },
        { status: 400 }
      );
    }

    // Add feedback to session store (generates unique ID and timestamp)
    const feedback = sessionStore.addFeedback(sessionId, text.trim());

    if (!feedback) {
      // Feedback creation failed (shouldn't happen unless session disappeared)
      return NextResponse.json(
        { error: "Failed to add feedback" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      feedbackId: feedback.id, // Return ID for potential future operations
    });
  } catch (error) {
    console.error("❌ Error submitting feedback:", error);
    return NextResponse.json(
      { error: "Failed to submit feedback" },
      { status: 500 }
    );
  }
}
