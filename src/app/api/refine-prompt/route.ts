import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface Asset {
  id: string;
  name: string;
  description: string;
  tags: string[];
}

export async function POST(request: NextRequest) {
  try {
    const { transcript, systemPrompt, assets } = await request.json();

    if (!transcript) {
      return NextResponse.json(
        { error: "No transcript provided" },
        { status: 400 }
      );
    }

    // Build asset context if assets are provided
    const assetList = assets as Asset[] | undefined;
    const hasAssets = assetList && assetList.length > 0;
    
    const assetContext = hasAssets
      ? `\n\nAVAILABLE ASSETS (select relevant ones by ID):
${assetList.map((a, i) => `${i + 1}. ID: "${a.id}" | Name: "${a.name}" | Description: "${a.description || 'No description'}" | Tags: [${a.tags.join(', ')}]`).join('\n')}`
      : '';

    const assetInstructions = hasAssets
      ? `\n\n5. Review the available assets and select any that would be relevant for this visual (e.g., company logos, UI designs, product images)
6. If assets are selected, reference them in your prompt (e.g., "incorporating the company logo" or "using the brand's UI style")`
      : '';

    const outputFormat = hasAssets
      ? `Output a JSON object with this exact format:
{
  "prompt": "your image generation prompt here",
  "selectedAssets": ["asset-id-1", "asset-id-2"] // IDs of relevant assets, or empty array if none
}

Output ONLY the JSON, nothing else.`
      : `Output ONLY the image generation prompt, nothing else.`;

    const defaultSystemPrompt = `You are an expert at distilling ideas into visual concepts for presentation graphics.

Your job is to:
1. Read the transcript/content provided
2. Identify the ONE key idea or concept that would make a compelling presentation graphic
3. Create a concise, vivid image prompt that will generate a professional slide visual
4. Keep the prompt under 100 words${assetInstructions}

Guidelines for the image prompt:
- Focus on ONE clear visual concept (not multiple ideas)
- Describe a professional, modern graphic style suitable for business presentations
- Use concrete visual elements (icons, diagrams, metaphors) rather than abstract descriptions
- Make it visually striking and memorable
${hasAssets ? '- If relevant assets exist (logos, UI, products), incorporate them into your visual concept' : ''}

${outputFormat}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: systemPrompt || defaultSystemPrompt,
        },
        {
          role: "user",
          content: `Analyze this transcript and create a focused image prompt for a presentation graphic:

"${transcript}"${assetContext}`,
        },
      ],
      max_tokens: 300,
      temperature: 0.7,
    });

    let rawResponse = response.choices[0]?.message?.content?.trim() || "";
    
    console.log(`[Refine Prompt] Raw GPT-4o response:`, rawResponse.slice(0, 200));
    console.log(`[Refine Prompt] Has assets:`, hasAssets, `Asset count:`, assetList?.length);
    
    let refinedPrompt: string;
    let selectedAssets: string[] = [];

    if (hasAssets && rawResponse) {
      try {
        // Strip markdown code blocks if present (GPT often wraps JSON in ```json ... ```)
        let jsonString = rawResponse;
        
        // Remove ```json or ``` at start
        if (jsonString.startsWith("```json")) {
          jsonString = jsonString.slice(7);
        } else if (jsonString.startsWith("```")) {
          jsonString = jsonString.slice(3);
        }
        
        // Remove ``` at end
        if (jsonString.endsWith("```")) {
          jsonString = jsonString.slice(0, -3);
        }
        
        jsonString = jsonString.trim();
        console.log(`[Refine Prompt] Cleaned JSON string:`, jsonString.slice(0, 200));
        
        // Try to parse JSON response
        const parsed = JSON.parse(jsonString);
        refinedPrompt = parsed.prompt;
        selectedAssets = parsed.selectedAssets || [];
        console.log(`[Refine Prompt] Parsed JSON - Prompt:`, refinedPrompt?.slice(0, 100));
        console.log(`[Refine Prompt] Selected assets:`, selectedAssets);
      } catch (e) {
        // If JSON parsing fails, use raw response as prompt
        console.log(`[Refine Prompt] JSON parse failed, using raw response. Error:`, e);
        refinedPrompt = rawResponse;
      }
    } else {
      refinedPrompt = rawResponse || "";
    }

    console.log(`[Refine Prompt] Final - Prompt length: ${refinedPrompt.length}, Selected assets: ${selectedAssets.length}`);

    return NextResponse.json({
      refinedPrompt,
      selectedAssets,
      model: "gpt-4o",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error refining prompt:", error);
    return NextResponse.json(
      { error: "Failed to refine prompt" },
      { status: 500 }
    );
  }
}

