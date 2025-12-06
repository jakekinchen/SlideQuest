"use client";

import { useState } from "react";
import AudioRecorder from "@/components/AudioRecorder";
import AssetBank, { Asset } from "@/components/AssetBank";
import ThemeSelector, { Theme } from "@/components/ThemeSelector";

export default function Home() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-zinc-950">
      <main className="flex w-full max-w-5xl flex-col items-center gap-8 py-16 px-6">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-5xl">
            Living Presentation
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Real-time audio → AI images with themes & brand assets
          </p>
        </div>

        {/* Theme Selector */}
        <div className="w-full">
          <ThemeSelector selectedTheme={selectedTheme} onThemeChange={setSelectedTheme} />
        </div>

        {/* Asset Bank */}
        <div className="w-full">
          <AssetBank assets={assets} onAssetsChange={setAssets} />
        </div>

        {/* Audio Recorder */}
        <AudioRecorder assets={assets} selectedTheme={selectedTheme} />

        <div className="text-center space-y-2 text-sm text-gray-500 dark:text-gray-500">
          <p>
            Powered by Deepgram Nova-2 + GPT-4o + Gemini 3 Pro Image (Nano Banana Pro)
          </p>
          <p className="text-xs">
            Select theme → Upload brand assets → GPT-4o selects relevant ones → Images match your style
          </p>
        </div>
      </main>
    </div>
  );
}
