"use client";

import { useState, useEffect } from "react";

export interface Theme {
  id: string;
  name: string;
  description: string;
  previewImages: string[]; // URLs to preview thumbnails
  referenceImages: string[]; // URLs to full reference images
}

// Predefined themes using images from public folder
export const THEMES: Theme[] = [
  {
    id: "minimal-creative",
    name: "Minimal Creative",
    description: "Clean, bold typography with light backgrounds and red accents",
    previewImages: [
      "/live-prez-reference/1.png",
      "/live-prez-reference/2.png",
      "/live-prez-reference/3.png",
    ],
    referenceImages: [
      "/live-prez-reference/1.png",
      "/live-prez-reference/2.png",
      "/live-prez-reference/3.png",
    ],
  },
  {
    id: "bold-blue",
    name: "Bold Blue",
    description: "Vibrant blue backgrounds, white typography, B&W photography, pill-shaped elements",
    previewImages: [
      "/proj-proposal/1.png",
      "/proj-proposal/2.png",
      "/proj-proposal/3.png",
    ],
    referenceImages: [
      "/proj-proposal/1.png",
      "/proj-proposal/2.png",
      "/proj-proposal/3.png",
    ],
  },
  {
    id: "none",
    name: "No Theme",
    description: "Generate without style guidance",
    previewImages: [],
    referenceImages: [],
  },
];

interface ThemeSelectorProps {
  selectedTheme: Theme | null;
  onThemeChange: (theme: Theme | null) => void;
}

export default function ThemeSelector({ selectedTheme, onThemeChange }: ThemeSelectorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [loadedImages, setLoadedImages] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  // Load and convert images to base64 when theme is selected
  const loadThemeImages = async (theme: Theme): Promise<string[]> => {
    if (theme.referenceImages.length === 0) return [];
    
    const base64Images: string[] = [];
    
    for (const imageUrl of theme.referenceImages) {
      try {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const dataUrl = reader.result as string;
            // Remove the data:image/xxx;base64, prefix
            resolve(dataUrl.split(",")[1]);
          };
          reader.readAsDataURL(blob);
        });
        base64Images.push(base64);
      } catch (error) {
        console.error(`Failed to load theme image: ${imageUrl}`, error);
      }
    }
    
    return base64Images;
  };

  const handleThemeSelect = async (theme: Theme) => {
    if (theme.id === "none") {
      onThemeChange(null);
      return;
    }
    
    setIsLoading(true);
    try {
      // Load images and pass them along with the theme
      const base64Images = await loadThemeImages(theme);
      const themeWithImages: Theme & { loadedImages?: string[] } = {
        ...theme,
        loadedImages: base64Images,
      };
      onThemeChange(themeWithImages as Theme);
    } catch (error) {
      console.error("Error loading theme images:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">🎨</span>
          <div className="text-left">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              Visual Theme
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {selectedTheme ? selectedTheme.name : "No theme selected"} • Style guides image generation
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isLoading && (
            <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          )}
          <span className="text-gray-400">{isExpanded ? "▼" : "▶"}</span>
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-4 space-y-4 bg-white dark:bg-gray-950">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Select a theme to guide the visual style of generated images. Theme reference images are sent to Nano Banana Pro.
          </p>
          
          {/* Theme Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {THEMES.map((theme) => (
              <button
                key={theme.id}
                onClick={() => handleThemeSelect(theme)}
                disabled={isLoading}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  selectedTheme?.id === theme.id
                    ? "border-purple-500 bg-purple-50 dark:bg-purple-950/20"
                    : "border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-700"
                } ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  {selectedTheme?.id === theme.id && (
                    <span className="text-purple-600">✓</span>
                  )}
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                    {theme.name}
                  </h4>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  {theme.description}
                </p>
                
                {/* Preview Images */}
                {theme.previewImages.length > 0 && (
                  <div className="flex gap-2">
                    {theme.previewImages.map((img, idx) => (
                      <div
                        key={idx}
                        className="w-16 h-12 rounded overflow-hidden bg-gray-100 dark:bg-gray-800"
                      >
                        <img
                          src={img}
                          alt={`${theme.name} preview ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                )}
                
                {theme.id === "none" && (
                  <div className="w-16 h-12 rounded border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center">
                    <span className="text-gray-400 text-xs">None</span>
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* How it works */}
          <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-900 rounded p-3">
            <strong>How it works:</strong> Theme images are sent as style references to Nano Banana Pro.
            The AI will match the visual style, typography, colors, and layout patterns from the theme.
          </div>
        </div>
      )}
    </div>
  );
}

