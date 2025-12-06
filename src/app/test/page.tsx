"use client";

import { useState } from "react";

const DEFAULT_SYSTEM_PROMPT = `You are an expert at distilling ideas into visual concepts for presentation graphics.

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

Output ONLY the image generation prompt, nothing else.`;

export default function WorkflowTester() {
  // Step 1: Input
  const [transcript, setTranscript] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  
  // Step 2: Refined Prompt
  const [refinedPrompt, setRefinedPrompt] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  
  // Step 3: Generated Image
  const [imageData, setImageData] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string>("image/png");
  const [isGenerating, setIsGenerating] = useState(false);
  
  // History for comparison
  const [history, setHistory] = useState<Array<{
    transcript: string;
    refinedPrompt: string;
    imageData: string;
    mimeType: string;
    timestamp: string;
  }>>([]);

  const handleRefinePrompt = async () => {
    if (!transcript.trim()) return;
    
    setIsRefining(true);
    try {
      const response = await fetch("/api/refine-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, systemPrompt }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setRefinedPrompt(data.refinedPrompt);
      } else {
        alert("Failed to refine prompt");
      }
    } catch (error) {
      console.error("Error:", error);
      alert("Error refining prompt");
    } finally {
      setIsRefining(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!refinedPrompt.trim()) return;
    
    setIsGenerating(true);
    try {
      const response = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: refinedPrompt }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setImageData(data.imageData);
        setImageMimeType(data.mimeType);
        
        // Add to history
        setHistory(prev => [{
          transcript,
          refinedPrompt,
          imageData: data.imageData,
          mimeType: data.mimeType,
          timestamp: data.timestamp,
        }, ...prev]);
      } else {
        alert("Failed to generate image");
      }
    } catch (error) {
      console.error("Error:", error);
      alert("Error generating image");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRunFullPipeline = async () => {
    await handleRefinePrompt();
    // Note: This won't wait properly, need to chain
  };

  const clearAll = () => {
    setTranscript("");
    setRefinedPrompt("");
    setImageData(null);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-purple-400 mb-2">
            🧪 Workflow Tester
          </h1>
          <p className="text-gray-400">
            Test and iterate on the GPT-4o → Nano Banana Pro pipeline
          </p>
          <a href="/" className="text-purple-500 hover:text-purple-400 text-sm">
            ← Back to main app
          </a>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Step 1: Input */}
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
            <div className="flex items-center gap-2 mb-4">
              <span className="bg-blue-600 text-white text-sm font-bold px-2 py-1 rounded">1</span>
              <h2 className="text-lg font-semibold">Input Transcript</h2>
            </div>
            
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Paste your transcript or content here..."
              className="w-full h-40 bg-gray-800 border border-gray-700 rounded-lg p-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none mb-4"
            />
            
            <details className="mb-4">
              <summary className="cursor-pointer text-sm text-gray-400 hover:text-gray-300">
                ⚙️ Edit System Prompt
              </summary>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="w-full h-48 mt-2 bg-gray-800 border border-gray-700 rounded-lg p-3 text-xs text-gray-300 font-mono focus:outline-none focus:border-purple-500 resize-none"
              />
              <button
                onClick={() => setSystemPrompt(DEFAULT_SYSTEM_PROMPT)}
                className="text-xs text-purple-500 hover:text-purple-400 mt-1"
              >
                Reset to default
              </button>
            </details>
            
            <button
              onClick={handleRefinePrompt}
              disabled={!transcript.trim() || isRefining}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed px-4 py-3 rounded-lg font-semibold transition-colors"
            >
              {isRefining ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Refining...
                </span>
              ) : (
                "🧠 Refine with GPT-4o →"
              )}
            </button>
          </div>

          {/* Step 2: Refined Prompt */}
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
            <div className="flex items-center gap-2 mb-4">
              <span className="bg-purple-600 text-white text-sm font-bold px-2 py-1 rounded">2</span>
              <h2 className="text-lg font-semibold">Refined Prompt</h2>
            </div>
            
            <textarea
              value={refinedPrompt}
              onChange={(e) => setRefinedPrompt(e.target.value)}
              placeholder="GPT-4o refined prompt will appear here... (editable)"
              className="w-full h-40 bg-gray-800 border border-gray-700 rounded-lg p-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none mb-4"
            />
            
            <p className="text-xs text-gray-500 mb-4">
              ✏️ You can edit this prompt before generating the image
            </p>
            
            <button
              onClick={handleGenerateImage}
              disabled={!refinedPrompt.trim() || isGenerating}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed px-4 py-3 rounded-lg font-semibold transition-colors"
            >
              {isGenerating ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Generating...
                </span>
              ) : (
                "🎨 Generate Image →"
              )}
            </button>
          </div>

          {/* Step 3: Generated Image */}
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
            <div className="flex items-center gap-2 mb-4">
              <span className="bg-green-600 text-white text-sm font-bold px-2 py-1 rounded">3</span>
              <h2 className="text-lg font-semibold">Generated Image</h2>
            </div>
            
            <div className="aspect-square bg-gray-800 border border-gray-700 rounded-lg flex items-center justify-center overflow-hidden mb-4">
              {imageData ? (
                <img
                  src={`data:${imageMimeType};base64,${imageData}`}
                  alt="Generated visual"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-gray-600 text-sm">
                  Image will appear here
                </span>
              )}
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={clearAll}
                className="flex-1 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Clear All
              </button>
              {imageData && (
                <a
                  href={`data:${imageMimeType};base64,${imageData}`}
                  download={`visual-${Date.now()}.png`}
                  className="flex-1 bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors text-center"
                >
                  Download
                </a>
              )}
            </div>
          </div>
        </div>

        {/* History Section */}
        {history.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xl font-semibold mb-4">📜 Generation History</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {history.map((item, index) => (
                <div
                  key={index}
                  className="bg-gray-900 rounded-xl p-4 border border-gray-800"
                >
                  <img
                    src={`data:${item.mimeType};base64,${item.imageData}`}
                    alt={`History ${index + 1}`}
                    className="w-full aspect-square object-cover rounded-lg mb-3"
                  />
                  <p className="text-xs text-purple-400 font-medium mb-1">Prompt:</p>
                  <p className="text-xs text-gray-400 mb-2 line-clamp-3">
                    {item.refinedPrompt}
                  </p>
                  <p className="text-xs text-gray-600">
                    {new Date(item.timestamp).toLocaleString()}
                  </p>
                  <button
                    onClick={() => {
                      setTranscript(item.transcript);
                      setRefinedPrompt(item.refinedPrompt);
                    }}
                    className="text-xs text-purple-500 hover:text-purple-400 mt-2"
                  >
                    Load this example →
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Tips */}
        <div className="mt-8 bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h2 className="text-lg font-semibold mb-3">💡 Tips for Improving the Workflow</h2>
          <ul className="text-sm text-gray-400 space-y-2">
            <li>• <strong>Edit the system prompt</strong> to change how GPT-4o interprets transcripts</li>
            <li>• <strong>Edit the refined prompt</strong> before generating to fine-tune the image</li>
            <li>• <strong>Compare history</strong> to see which prompts produce better results</li>
            <li>• Try adding specific style instructions (e.g., "flat design", "isometric", "minimalist")</li>
            <li>• Include color preferences in the system prompt for consistent branding</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

