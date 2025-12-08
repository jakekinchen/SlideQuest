/**
 * @fileoverview Slide synchronization API endpoint
 *
 * Manages the current slide state for real-time presentation synchronization between
 * presenter and audience. The presenter POSTs slide updates, and audience members poll
 * via GET every 2 seconds.
 *
 * Endpoints:
 * - POST /api/sessions/[sessionId]/slide - Update current slide (presenter)
 * - GET /api/sessions/[sessionId]/slide  - Retrieve current slide (audience)
 *
 * POST Request: {
 *   slide: SlideData | null  // Slide to display, or null to clear
 * }
 *
 * GET Response: {
 *   slide: SlideData | null  // Current slide, or null if none
 * }
 *
 * Architecture:
 * - Uses polling (2s interval) instead of SSE for simplicity
 * - Presenter pushes updates via POST
 * - Audience pulls updates via GET
 * - Only one "current slide" per session (not a history)
 *
 * Alternative considered: Using SSE for slide updates (like feedback)
 * Current approach chosen for: Simplicity, client-side control of update frequency
 */

import { NextRequest, NextResponse } from "next/server";
import { sessionStore } from "@/lib/sessionStore";

/**
 * POST handler for updating the current slide (called by presenter).
 *
 * Workflow:
 * 1. Validates session exists
 * 2. Accepts SlideData object or null (to clear slide)
 * 3. Updates sessionStore with new current slide
 * 4. Audience will see update on next poll (within 2 seconds)
 *
 * @param request - NextRequest with JSON body containing slide field
 * @param params - Route params containing sessionId
 * @returns NextResponse with success status
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    // Validate session exists before attempting update
    const session = sessionStore.getSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: "Session not found or expired" },
        { status: 404 }
      );
    }

    // Parse request body (expecting { slide: SlideData | null })
    const body = await request.json();
    const { slide } = body;

    // Update current slide in session store (null clears the slide)
    const success = sessionStore.updateCurrentSlide(sessionId, slide);

    if (!success) {
      // Update failed (session might have expired between validation and update)
      return NextResponse.json(
        { error: "Failed to update slide" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("❌ Error updating slide:", error);
    return NextResponse.json(
      { error: "Failed to update slide" },
      { status: 500 }
    );
  }
}

/**
 * GET handler for retrieving the current slide (called by audience).
 *
 * Polled by audience members every 2 seconds to stay synchronized with presenter.
 * Returns null if no slide is currently being displayed.
 *
 * Workflow:
 * 1. Validates session exists
 * 2. Retrieves current slide from sessionStore
 * 3. Returns slide (or null if none)
 *
 * @param request - NextRequest (unused, but required by Next.js API route signature)
 * @param params - Route params containing sessionId
 * @returns NextResponse with slide object or null
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    // Validate session exists (audience polling expired session)
    const session = sessionStore.getSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: "Session not found or expired" },
        { status: 404 }
      );
    }

    // Get current slide (returns null if no slide is displayed)
    const slide = sessionStore.getCurrentSlide(sessionId);

    return NextResponse.json({ slide });
  } catch (error) {
    console.error("❌ Error getting slide:", error);
    return NextResponse.json(
      { error: "Failed to get slide" },
      { status: 500 }
    );
  }
}
