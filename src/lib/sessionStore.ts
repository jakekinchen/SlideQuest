/**
 * @fileoverview In-memory session storage for presentation sessions
 *
 * This module manages presentation sessions, slides, and audience feedback using
 * an in-memory Map. Sessions expire after 4 hours and are automatically cleaned up
 * every 30 minutes.
 *
 * IMPORTANT: This is not production-ready persistence. All data is lost on server
 * restart. For production use, migrate to Redis, PostgreSQL, or another persistent
 * storage solution.
 *
 * Key responsibilities:
 * - Session lifecycle management (create, retrieve, delete, expire)
 * - Audience feedback storage and retrieval
 * - Current slide state management for real-time synchronization
 * - Automatic cleanup of expired sessions
 */

import { nanoid } from "nanoid";
import { Session, Feedback } from "@/types/feedback";

/**
 * Represents a presentation slide with various display formats.
 * Slides can be AI-generated, PDF-sourced, or audience question slides.
 */
interface SlideData {
  /** Unique identifier (UUID or nanoid) */
  id: string;
  /** Base64 data URL for PDF-sourced slides */
  imageUrl?: string;
  /** Main title text for AI-generated or question slides */
  headline?: string;
  /** Subtitle text for context or categorization */
  subheadline?: string;
  /** Array of bullet points for text-based slides */
  bullets?: string[];
  /** Background color (hex code or color name) for text slides */
  backgroundColor?: string;
  /** Original voice transcript or question that generated this slide */
  originalIdea?: {
    title: string;
    content: string;
    category: string;
  };
  /** ISO 8601 timestamp of slide creation */
  timestamp?: string;
}

/**
 * Extended session data stored in memory, including feedback and current slide state.
 * This extends the base Session interface with additional server-side data.
 */
interface SessionData extends Session {
  /** Array of audience feedback/questions for this session */
  feedback: Feedback[];
  /** The slide currently being displayed to the audience (null if none) */
  currentSlide: SlideData | null;
}

/**
 * In-memory store for sessions. All data is volatile and lost on server restart.
 *
 * Architecture note: Using a Map for O(1) lookups by session ID. For production,
 * this should be replaced with Redis for persistence and horizontal scaling,
 * or PostgreSQL with proper indexing.
 */
const sessions = new Map<string, SessionData>();

/**
 * Automatic cleanup interval that removes expired sessions every 30 minutes.
 * This prevents memory leaks from abandoned sessions. The 30-minute interval
 * is a balance between cleanup frequency and performance impact.
 *
 * Note: In a multi-instance deployment, this would need to be coordinated
 * across instances (e.g., using a distributed lock with Redis).
 */
setInterval(() => {
  const now = new Date().toISOString();
  for (const [sessionId, session] of sessions.entries()) {
    if (session.expiresAt < now) {
      sessions.delete(sessionId);
      console.log(`🗑️ Cleaned up expired session: ${sessionId}`);
    }
  }
}, 30 * 60 * 1000); // 30 minutes

export const sessionStore = {
  /**
   * Creates a new session with a unique ID
   * Returns the session object
   */
  createSession(): Session {
    const id = nanoid(8);
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(); // 4 hours

    const session: SessionData = {
      id,
      createdAt,
      expiresAt,
      feedback: [],
      currentSlide: null,
    };

    sessions.set(id, session);
    console.log(`✅ Created session: ${id}, expires at ${expiresAt}`);

    return { id, createdAt, expiresAt };
  },

  /**
   * Retrieves a session by ID
   * Returns null if not found or expired
   */
  getSession(sessionId: string): Session | null {
    const session = sessions.get(sessionId);
    if (!session) return null;

    // Check if expired
    if (session.expiresAt < new Date().toISOString()) {
      sessions.delete(sessionId);
      return null;
    }

    return { id: session.id, createdAt: session.createdAt, expiresAt: session.expiresAt };
  },

  /**
   * Adds feedback to a session
   * Returns the feedback object or null if session not found
   */
  addFeedback(sessionId: string, text: string): Feedback | null {
    const session = sessions.get(sessionId);
    if (!session) return null;

    // Check if expired
    if (session.expiresAt < new Date().toISOString()) {
      sessions.delete(sessionId);
      return null;
    }

    const feedback: Feedback = {
      id: nanoid(8),
      sessionId,
      text,
      timestamp: new Date().toISOString(),
    };

    session.feedback.push(feedback);
    console.log(`📝 Added feedback to session ${sessionId}: "${text.substring(0, 50)}..."`);

    return feedback;
  },

  /**
   * Gets all feedback for a session
   * Optionally filter by timestamp (get feedback since a specific time)
   */
  getFeedback(sessionId: string, since?: string): Feedback[] {
    const session = sessions.get(sessionId);
    if (!session) return [];

    // Check if expired
    if (session.expiresAt < new Date().toISOString()) {
      sessions.delete(sessionId);
      return [];
    }

    if (since) {
      return session.feedback.filter((f) => f.timestamp > since);
    }

    return session.feedback;
  },

  /**
   * Deletes a session and all its feedback
   */
  deleteSession(sessionId: string): void {
    sessions.delete(sessionId);
    console.log(`🗑️ Deleted session: ${sessionId}`);
  },

  /**
   * Updates the current slide for a session
   * Returns true if successful, false if session not found
   */
  updateCurrentSlide(sessionId: string, slide: SlideData | null): boolean {
    const session = sessions.get(sessionId);
    if (!session) return false;

    // Check if expired
    if (session.expiresAt < new Date().toISOString()) {
      sessions.delete(sessionId);
      return false;
    }

    session.currentSlide = slide;
    console.log(`📺 Updated current slide for session ${sessionId}`);
    return true;
  },

  /**
   * Gets the current slide for a session
   */
  getCurrentSlide(sessionId: string): SlideData | null {
    const session = sessions.get(sessionId);
    if (!session) return null;

    // Check if expired
    if (session.expiresAt < new Date().toISOString()) {
      sessions.delete(sessionId);
      return null;
    }

    return session.currentSlide;
  },
};
