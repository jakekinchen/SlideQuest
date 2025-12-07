import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const googleApiKey = process.env.GOOGLE_API_KEY;
const genAI = googleApiKey ? new GoogleGenerativeAI(googleApiKey) : null;
const fallbackColors = ["#0f172a", "#1e1b4b", "#1d4ed8", "#be123c", "#047857"];
const fallbackSubheading: Record<string, string> = {
  concept: "Key concept",
  data: "Key data",
  quote: "Quote to highlight",
  argument: "Core argument",
  conclusion: "Takeaway",
  transition: "Next topic",
};

function buildFallbackSlide(title: string, content: string, category: string) {
  const normalizedCategory = category || "concept";
  const bullets = content
    .split(/[\n\.?!]/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 4);

  return {
    id: crypto.randomUUID(),
    headline: title && title.trim().length > 0 ? title : "New Slide Idea",
    subheadline:
      fallbackSubheading[normalizedCategory] ?? "Fresh insight from the talk",
    bullets,
    backgroundColor:
    fallbackColors[Math.abs(normalizedCategory.charCodeAt(0)) % fallbackColors.length],
    originalIdea: { title, content, category },
    timestamp: new Date().toISOString(),
  };
}

function handleFallbackResponse(title: string, content: string, category: string) {
  return NextResponse.json({
    success: true,
    slide: buildFallbackSlide(title, content, category),
  });
}

export async function POST(request: NextRequest) {
  try {
    const { title, content, category } = await request.json();

    if (!title || !content || !category) {
      return NextResponse.json(
        { error: "Title, content, and category are required" },
        { status: 400 }
      );
    }

    if (!genAI) {
      console.warn("GOOGLE_API_KEY not configured. Falling back to text slide.");
      return handleFallbackResponse(title, content, category);
    }

    try {
      const model = genAI.getGenerativeModel({
        model: "gemini-3-pro-image-preview",
      });

      const prompt = `Create a presentation slide image that visually explains the following idea from a speaker:

Title: ${title}
Content: ${content}
Category: ${category}

The image should be a professional, modern presentation slide. It should include the title and visual elements that explain the content.`;

      const result = await model.generateContent(prompt);
      const response = result.response;

      const candidate = response.candidates?.[0];
      const imagePart = candidate?.content?.parts?.find(
        (part) => part.inlineData
      );

      if (!imagePart?.inlineData) {
        console.warn("Gemini response did not contain an image. Falling back.");
        return handleFallbackResponse(title, content, category);
      }

      const imageBase64 = imagePart.inlineData.data;
      const mimeType = imagePart.inlineData.mimeType || "image/png";
      const dataUrl = `data:${mimeType};base64,${imageBase64}`;

      return NextResponse.json({
        success: true,
        slide: {
          id: crypto.randomUUID(),
          imageUrl: dataUrl,
          originalIdea: { title, content, category },
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("Gemini API error:", error);
      return handleFallbackResponse(title, content, category);
    }
  } catch (error) {
    console.error("Gemini route error:", error);
    return NextResponse.json(
      { error: "Failed to process idea" },
      { status: 500 }
    );
  }
}
