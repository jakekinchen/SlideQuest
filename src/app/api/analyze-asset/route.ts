import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");

export async function POST(request: NextRequest) {
  try {
    const { imageData, mimeType, fileName } = await request.json();

    if (!imageData) {
      return NextResponse.json(
        { error: "No image data provided" },
        { status: 400 }
      );
    }

    console.log(`[Analyze Asset] Analyzing image: ${fileName || "unnamed"} (${mimeType})`);

    // Use Gemini 2.0 Flash for vision analysis (fast and capable)
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-exp",
    });

    const prompt = `Analyze this image and generate metadata for use in a presentation asset library.

The metadata will help an AI system decide when to use this image as a reference for generating presentation graphics.

Please respond with a JSON object in this exact format:
{
  "name": "A short, descriptive name for this asset (2-5 words)",
  "description": "A detailed description of what this image contains and when it should be used in presentations. Include colors, style, and purpose. (1-2 sentences)",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}

Guidelines for tags:
- Include what the image IS (logo, icon, chart, photo, ui, screenshot, etc.)
- Include the subject matter (cloud, analytics, user, security, etc.)
- Include style/color if notable (blue, minimal, gradient, etc.)
- Include use cases (branding, header, dashboard, etc.)
- 5-8 tags is ideal

Respond with ONLY the JSON, no markdown code blocks or other text.`;

    const result = await model.generateContent([
      { text: prompt },
      {
        inlineData: {
          mimeType: mimeType,
          data: imageData,
        },
      },
    ]);

    const responseText = result.response.text().trim();
    console.log(`[Analyze Asset] Raw response:`, responseText.slice(0, 200));

    // Parse the JSON response (handle potential markdown wrapping)
    let jsonString = responseText;
    if (jsonString.startsWith("```json")) {
      jsonString = jsonString.slice(7);
    } else if (jsonString.startsWith("```")) {
      jsonString = jsonString.slice(3);
    }
    if (jsonString.endsWith("```")) {
      jsonString = jsonString.slice(0, -3);
    }
    jsonString = jsonString.trim();

    const metadata = JSON.parse(jsonString);

    console.log(`[Analyze Asset] Generated metadata:`, metadata);

    return NextResponse.json({
      name: metadata.name || fileName || "Unnamed Asset",
      description: metadata.description || "",
      tags: metadata.tags || [],
    });
  } catch (error) {
    console.error("Error analyzing asset:", error);
    return NextResponse.json(
      { error: "Failed to analyze asset" },
      { status: 500 }
    );
  }
}

