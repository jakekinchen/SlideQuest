import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");

interface ReferenceImage {
  imageData: string; // base64
  mimeType: string;
  name?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { prompt, referenceImages } = await request.json();

    if (!prompt) {
      return NextResponse.json(
        { error: "No prompt provided" },
        { status: 400 }
      );
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-3-pro-image-preview",
    });

    // Build content parts - text prompt + any reference images
    const parts: any[] = [];
    
    // Add reference images if provided
    const refs = referenceImages as ReferenceImage[] | undefined;
    
    console.log(`[Generate Image] Received ${refs?.length || 0} reference images`);
    
    // Filter to only supported MIME types (Gemini doesn't support SVG)
    const supportedMimeTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
    const filteredRefs = refs?.filter(r => {
      const isSupported = supportedMimeTypes.includes(r.mimeType);
      if (!isSupported) {
        console.log(`[Generate Image] Skipping unsupported format: ${r.name} (${r.mimeType})`);
      }
      return isSupported;
    });
    
    if (filteredRefs && filteredRefs.length > 0) {
      // Log what we're receiving
      console.log(`[Generate Image] Reference images (after filtering):`, filteredRefs.map(r => ({ name: r.name, mimeType: r.mimeType, dataLength: r.imageData?.length })));
      
      // Build a strong instruction to use the reference images
      const refNames = filteredRefs.map(r => r.name).filter(Boolean).join(", ");
      
      parts.push({
        text: `IMPORTANT: You MUST incorporate the following reference images into your generated image. These are brand assets that need to be visually represented in the output:

Reference images provided: ${refNames}

Instructions:
1. Study each reference image carefully
2. Include recognizable elements, styles, colors, or icons from these references in your generated image
3. Maintain brand consistency with the reference materials
4. The final image should clearly show influence from these reference assets

`,
      });
      
      // Add each reference image with clear labeling
      for (let i = 0; i < filteredRefs.length; i++) {
        const ref = filteredRefs[i];
        parts.push({ 
          text: `\n--- Reference Image ${i + 1}${ref.name ? ` (${ref.name})` : ''} ---\n` 
        });
        parts.push({
          inlineData: {
            mimeType: ref.mimeType,
            data: ref.imageData,
          },
        });
      }
      
      parts.push({ 
        text: `\n\n--- END OF REFERENCE IMAGES ---\n\nNow, generate a professional presentation slide image based on this prompt, incorporating visual elements from the reference images above:\n\n${prompt}` 
      });
      
      console.log(`[Generate Image] Built ${parts.length} parts for Gemini`);
    } else {
      // No reference images (or all filtered out), just the prompt
      console.log(`[Generate Image] No supported reference images, using prompt only`);
      parts.push({ text: prompt });
    }

    const result = await model.generateContent(parts);

    const imagePart = result.response.candidates?.[0]?.content?.parts?.find(
      (part: any) => part.inlineData
    );

    if (!imagePart || !imagePart.inlineData) {
      console.log(`[Generate Image] No image in response. Response:`, JSON.stringify(result.response, null, 2));
      return NextResponse.json(
        { error: "No image generated" },
        { status: 500 }
      );
    }

    console.log(`[Generate Image] Successfully generated image with ${filteredRefs?.length || 0} references`);

    return NextResponse.json({
      imageData: imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType || "image/png",
      timestamp: new Date().toISOString(),
      usedReferences: filteredRefs?.length || 0,
    });
  } catch (error) {
    console.error("Error generating image:", error);
    return NextResponse.json(
      { error: "Failed to generate image" },
      { status: 500 }
    );
  }
}

