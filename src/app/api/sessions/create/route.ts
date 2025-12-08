/**
 * @fileoverview Session creation API endpoint
 *
 * Creates a new presentation session with a unique 8-character ID and provides
 * the audience URL for sharing. Sessions are stored in-memory and expire after 4 hours.
 *
 * Endpoint: POST /api/sessions/create
 * Request: No body required
 *
 * Response: {
 *   sessionId: string,      // 8-character nanoid
 *   audienceUrl: string,    // Relative path to audience view
 *   expiresAt: string       // ISO 8601 expiration timestamp
 * }
 *
 * Security note: Session IDs are generated with nanoid(8), providing ~208 billion
 * combinations. This is sufficient for short-lived sessions but consider longer IDs
 * or authentication for production use.
 */

import { NextResponse } from "next/server";
import { sessionStore } from "@/lib/sessionStore";

/**
 * POST handler for creating new presentation sessions.
 *
 * Workflow:
 * 1. Generates unique 8-character session ID via nanoid
 * 2. Stores session in sessionStore with 4-hour expiration
 * 3. Constructs audience URL for sharing
 * 4. Returns session details
 *
 * @returns NextResponse with sessionId, audienceUrl, and expiresAt timestamp
 */
export async function POST() {
  try {
    // Create session with auto-generated ID and 4-hour expiration
    const session = sessionStore.createSession();

    // Construct the audience URL (relative path for easy deployment)
    const audienceUrl = `/presentation/${session.id}`;

    return NextResponse.json({
      sessionId: session.id,
      audienceUrl,
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    console.error("❌ Error creating session:", error);
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    );
  }
}
