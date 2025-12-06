import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: NextRequest) {
  try {
    const { transcript } = await request.json();

    if (!transcript) {
      return NextResponse.json(
        { error: "No transcript provided" },
        { status: 400 }
      );
    }

    // Step 1: Use GPT-4o to analyze transcript and create a focused image prompt
    console.log("Step 1: Analyzing transcript with GPT-4o...");
    
    const gptResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert at distilling ideas into visual concepts for presentation graphics.

Your job is to:
1. Read the transcript/content provided
2. Identify the ONE key idea or concept that would make a compelling presentation graphic
3. Create a concise, vivid image prompt that will generate a professional slide visual

Guidelines for the image prompt:
- Focus on ONE clear visual concept (not multiple ideas)
- Describe a professional, modern graphic style suitable for business presentations
- Use concrete visual elements (icons, diagrams, metaphors) rather than abstract descriptions
- Keep it under 100 words
- Make it visually striking and memorable

Output ONLY the image generation prompt, nothing else.`
        },
        {
          role: "user",
          content: `Analyze this transcript and create a focused image prompt for a presentation graphic:

"${transcript}"`
        }
      ],
      max_tokens: 200,
      temperature: 0.7,
    });

    const refinedPrompt = gptResponse.choices[0]?.message?.content?.trim();
    
    if (!refinedPrompt) {
      return NextResponse.json(
        { error: "Failed to generate image prompt" },
        { status: 500 }
      );
    }

    console.log("Refined prompt:", refinedPrompt);

    // Step 2: Use Gemini 3 Pro Image (Nano Banana Pro) to generate the image
    console.log("Step 2: Generating image with Nano Banana Pro...");
    
    const model = genAI.getGenerativeModel({ 
      model: "gemini-3-pro-image-preview",
    });

    const result = await model.generateContent(refinedPrompt);

    // Extract the image data from the response
    const imagePart = result.response.candidates?.[0]?.content?.parts?.find(
      (part: any) => part.inlineData
    );

    if (!imagePart || !imagePart.inlineData) {
      return NextResponse.json(
        { error: "No image generated" },
        { status: 500 }
      );
    }

    // Return the base64 image data along with the refined prompt
    return NextResponse.json({
      imageData: imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType || "image/png",
      refinedPrompt: refinedPrompt,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error generating image:", error);
    return NextResponse.json(
      { error: "Failed to generate image" },
      { status: 500 }
    );
  }
}

