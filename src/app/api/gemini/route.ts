/**
 * @fileoverview Gemini AI slide generation API endpoint
 *
 * This endpoint converts voice transcripts into presentation slides using Google's
 * Gemini AI. It attempts to generate visual slide images via Gemini, but falls back
 * to structured text slides if image generation fails or GOOGLE_API_KEY is missing.
 *
 * Request: POST /api/gemini
 * Body: { title: string, content: string, category: string }
 *
 * Response: {
 *   success: boolean,
 *   slide: SlideData (with either imageUrl or headline/bullets)
 * }
 *
 * Architecture decisions:
 * - Fallback strategy ensures slides are always generated (graceful degradation)
 * - Text fallback uses color-coded templates based on category
 * - Parsing bullet points from content (splits by punctuation)
 *
 * NOTE: Currently Gemini image generation model ("gemini-3-pro-image-preview")
 * is experimental and often falls back to text slides.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

// Initialize Gemini AI client (null if API key not configured)
const googleApiKey = process.env.GOOGLE_API_KEY;
const genAI = googleApiKey ? new GoogleGenerativeAI(googleApiKey) : null;

/**
 * Fallback color palette for text-based slides when AI generation fails.
 * Professional, high-contrast colors optimized for presentation visibility.
 */
const fallbackColors = ["#0f172a", "#1e1b4b", "#1d4ed8", "#be123c", "#047857"];

/**
 * Category-specific subheadings for text slides.
 * Provides context about the type of content being presented.
 */
const fallbackSubheading: Record<string, string> = {
  concept: "Key concept",
  data: "Key data",
  quote: "Quote to highlight",
  argument: "Core argument",
  conclusion: "Takeaway",
  transition: "Next topic",
};

/**
 * Builds a structured text-based slide as fallback when AI generation fails.
 *
 * Slide structure:
 * - Headline: Title provided (or "New Slide Idea" if empty)
 * - Subheadline: Category-based context
 * - Bullets: Parsed from content (split by sentence terminators)
 * - Background: Color selected deterministically from category name
 *
 * @param title - Main headline for the slide
 * @param content - Full transcript text to parse into bullets
 * @param category - Slide type (concept, data, quote, argument, conclusion, transition)
 * @returns SlideData object with text content and styling
 */
function buildFallbackSlide(title: string, content: string, category: string) {
  const normalizedCategory = category || "concept";

  // Parse content into bullet points by splitting on sentence terminators
  // Limits to 4 bullets to avoid cluttered slides
  const bullets = content
    .split(/[\n\.?!]/) // Split on newlines or punctuation (., ?, !)
    .map((line) => line.trim())
    .filter((line) => line.length > 0) // Remove empty lines
    .slice(0, 4); // Max 4 bullets for readability

  return {
    id: crypto.randomUUID(),
    headline: title && title.trim().length > 0 ? title : "New Slide Idea",
    subheadline:
      fallbackSubheading[normalizedCategory] ?? "Fresh insight from the talk",
    bullets,
    // Deterministic color selection based on category name (same category = same color)
    backgroundColor:
      fallbackColors[Math.abs(normalizedCategory.charCodeAt(0)) % fallbackColors.length],
    originalIdea: { title, content, category },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Helper function to return fallback slide response with proper formatting.
 *
 * @param title - Slide title
 * @param content - Slide content
 * @param category - Content category
 * @returns NextResponse with formatted slide data
 */
function handleFallbackResponse(title: string, content: string, category: string) {
  return NextResponse.json({
    success: true,
    slide: buildFallbackSlide(title, content, category),
  });
}

/**
 * POST handler for generating presentation slides from voice transcripts.
 *
 * Workflow:
 * 1. Validate request payload (title, content, category required)
 * 2. Check if GOOGLE_API_KEY configured
 * 3. Attempt Gemini image generation (if configured)
 * 4. Fall back to text slide if image generation fails
 * 5. Return slide data with unique ID and timestamp
 *
 * Error handling:
 * - Missing fields → 400 Bad Request
 * - No API key → Fallback text slide
 * - Gemini API error → Fallback text slide
 * - Unexpected error → 500 Internal Server Error
 *
 * @param request - NextRequest with JSON body { title, content, category }
 * @returns NextResponse with { success: boolean, slide: SlideData }
 */
export async function POST(request: NextRequest) {
  try {
    const { title, content, category } = await request.json();

    // Validate required fields
    if (!title || !content || !category) {
      return NextResponse.json(
        { error: "Title, content, and category are required" },
        { status: 400 }
      );
    }

    // If no API key configured, skip AI generation and use text fallback
    if (!genAI) {
      console.warn("GOOGLE_API_KEY not configured. Falling back to text slide.");
      return handleFallbackResponse(title, content, category);
    }

    // Attempt AI image generation with Gemini
    try {
      // NOTE: This model is experimental and often unavailable
      const model = genAI.getGenerativeModel({
        model: "gemini-3-pro-image-preview",
      });

      // Prompt engineering for presentation slide generation
      const prompt = `Create a presentation slide image that visually explains the following idea from a speaker:

Title: ${title}
Content: ${content}
Category: ${category}

The image should be a professional, modern presentation slide. It should include the title and visual elements that explain the content.`;

      // Call Gemini API to generate slide image
      const result = await model.generateContent(prompt);
      const response = result.response;

      // Extract image from Gemini response (if present)
      const candidate = response.candidates?.[0];
      const imagePart = candidate?.content?.parts?.find(
        (part) => part.inlineData
      );

      // Gemini didn't return an image → fall back to text slide
      if (!imagePart?.inlineData) {
        console.warn("Gemini response did not contain an image. Falling back.");
        return handleFallbackResponse(title, content, category);
      }

      // Convert base64 image to data URL for embedding in slide
      const imageBase64 = imagePart.inlineData.data;
      const mimeType = imagePart.inlineData.mimeType || "image/png";
      const dataUrl = `data:${mimeType};base64,${imageBase64}`;

      // Return image-based slide
      return NextResponse.json({
        success: true,
        slide: {
          id: crypto.randomUUID(),
          imageUrl: dataUrl, // Base64 data URL (no external storage needed)
          originalIdea: { title, content, category },
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      // Gemini API error (rate limit, model unavailable, etc.) → fallback gracefully
      console.error("Gemini API error:", error);
      return handleFallbackResponse(title, content, category);
    }
  } catch (error) {
    // Unexpected error (JSON parse failure, etc.) → 500 error
    console.error("Gemini route error:", error);
    return NextResponse.json(
      { error: "Failed to process idea" },
      { status: 500 }
    );
  }
}
