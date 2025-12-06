import { NextResponse } from "next/server";

export async function GET() {
  // Return the Deepgram API key for client-side use
  // In production, you might want to generate temporary keys instead
  const apiKey = process.env.DEEPGRAM_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Deepgram API key not configured" },
      { status: 500 }
    );
  }

  return NextResponse.json({ apiKey });
}

