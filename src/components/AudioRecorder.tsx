"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import { Asset } from "./AssetBank";

interface Visual {
  id: string;
  imageData: string;
  mimeType: string;
  timestamp: string;
  transcriptSegment: string;
  refinedPrompt: string;
  chunkNumber: number;
  selectedAssets?: string[];
  usedReferences?: number;
}

interface PendingChunk {
  id: string;
  transcriptSegment: string;
  status: "pending" | "refining" | "generating" | "complete" | "error";
  refinedPrompt?: string;
  chunkNumber: number;
  startTime: number;
}

const CHUNK_INTERVAL_MS = 15000; // 15 seconds
const MIN_CHUNK_CHARS = 150; // Minimum characters before triggering a chunk
const CHECK_INTERVAL_MS = 2000; // Check every 2 seconds for enough content

interface AudioRecorderProps {
  assets?: Asset[];
}

export default function AudioRecorder({ assets = [] }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [visuals, setVisuals] = useState<Visual[]>([]);
  const [isGeneratingVisual, setIsGeneratingVisual] = useState(false);
  const [inputMode, setInputMode] = useState<"record" | "text" | "live">("text");
  
  // Live pipeline state
  const [pendingChunks, setPendingChunks] = useState<PendingChunk[]>([]);
  const [autoGenerate, setAutoGenerate] = useState(true);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [nextChunkIn, setNextChunkIn] = useState(CHUNK_INTERVAL_MS / 1000);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const deepgramRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastChunkIndexRef = useRef(0);
  const chunkCounterRef = useRef(0);
  const recordingStartTimeRef = useRef<number | null>(null);
  const chunkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptRef = useRef(transcript); // Keep ref in sync with state
  
  // Keep transcript ref updated
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  const startRecording = async () => {
    try {
      setIsConnecting(true);

      // Get API key from server
      const keyResponse = await fetch("/api/deepgram-key");
      const { apiKey } = await keyResponse.json();

      // Create Deepgram client
      const deepgram = createClient(apiKey);

      // Get microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Create connection to Deepgram
      const connection = deepgram.listen.live({
        model: "nova-2",
        language: "en-US",
        smart_format: true,
        interim_results: true,
      });

      deepgramRef.current = connection;

      // Set up event listeners
      connection.on(LiveTranscriptionEvents.Open, () => {
        console.log("Deepgram connection opened");
        setIsConnecting(false);
        setIsRecording(true);

        // Create MediaRecorder to capture audio
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: "audio/webm",
        });
        mediaRecorderRef.current = mediaRecorder;

        // Send audio data to Deepgram
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0 && connection.getReadyState() === 1) {
            connection.send(event.data);
          }
        };

        // Start recording in 250ms chunks
        mediaRecorder.start(250);
      });

      connection.on(LiveTranscriptionEvents.Transcript, (data) => {
        const transcript = data.channel.alternatives[0].transcript;
        
        if (transcript !== "") {
          if (data.is_final) {
            // Final transcript - add to permanent transcript
            setTranscript((prev) => prev + transcript + " ");
            setInterimTranscript("");
          } else {
            // Interim transcript - show as temporary
            setInterimTranscript(transcript);
          }
        }
      });

      connection.on(LiveTranscriptionEvents.Error, (error) => {
        console.error("Deepgram error:", error);
        alert("Transcription error. Please try again.");
        stopRecording();
      });

      connection.on(LiveTranscriptionEvents.Close, () => {
        console.log("Deepgram connection closed");
      });

    } catch (error) {
      console.error("Error starting recording:", error);
      alert("Could not start recording. Please check your microphone permissions and API key.");
      setIsConnecting(false);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    // Stop MediaRecorder
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }

    // Close Deepgram connection
    if (deepgramRef.current) {
      deepgramRef.current.finish();
      deepgramRef.current = null;
    }

    // Stop all audio tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // Clear intervals
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (chunkIntervalRef.current) {
      clearInterval(chunkIntervalRef.current);
      chunkIntervalRef.current = null;
    }

    // Trigger final chunk if in live mode (force = true to capture remaining content)
    if (inputMode === "live" && autoGenerate) {
      console.log("[Stop] Triggering final chunk");
      // Small delay to ensure final transcript is captured
      setTimeout(() => {
        triggerChunkGeneration(true); // Force trigger even with less content
      }, 500);
    }

    setIsRecording(false);
    setInterimTranscript("");
    setElapsedTime(0);
    setNextChunkIn(CHUNK_INTERVAL_MS / 1000);
    recordingStartTimeRef.current = null;
  };

  // Process a chunk through the full pipeline (for live mode)
  const processChunk = useCallback(async (chunk: PendingChunk) => {
    const chunkId = chunk.id;
    
    try {
      // Step 1: Refine prompt with GPT-4o (including asset selection)
      setPendingChunks(prev => 
        prev.map(c => c.id === chunkId ? { ...c, status: "refining" as const } : c)
      );
      
      // Send assets metadata (not images) for GPT-4o to select from
      const assetMetadata = assets.map(a => ({
        id: a.id,
        name: a.name,
        description: a.description,
        tags: a.tags,
      }));
      
      const refineResponse = await fetch("/api/refine-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          transcript: chunk.transcriptSegment,
          assets: assetMetadata.length > 0 ? assetMetadata : undefined,
        }),
      });
      
      if (!refineResponse.ok) throw new Error("Failed to refine prompt");
      const refineData = await refineResponse.json();
      
      // Get selected assets' full data
      const selectedAssetIds = refineData.selectedAssets || [];
      const selectedAssets = assets.filter(a => selectedAssetIds.includes(a.id));
      
      console.log(`[Frontend] GPT-4o selected ${selectedAssetIds.length} assets:`, selectedAssetIds);
      console.log(`[Frontend] Matched ${selectedAssets.length} full assets:`, selectedAssets.map(a => a.name));
      
      setPendingChunks(prev => 
        prev.map(c => c.id === chunkId ? { ...c, status: "generating" as const, refinedPrompt: refineData.refinedPrompt } : c)
      );
      
      // Step 2: Generate image with Nano Banana Pro (including reference images)
      const referenceImages = selectedAssets.map(a => ({
        imageData: a.imageData,
        mimeType: a.mimeType,
        name: a.name,
      }));
      
      console.log(`[Frontend] Sending ${referenceImages.length} reference images to generate-image API`);
      if (referenceImages.length > 0) {
        console.log(`[Frontend] Reference images:`, referenceImages.map(r => ({ name: r.name, mimeType: r.mimeType, dataLength: r.imageData?.length })));
      }
      
      const imageResponse = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          prompt: refineData.refinedPrompt,
          referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
        }),
      });
      
      if (!imageResponse.ok) throw new Error("Failed to generate image");
      const imageData = await imageResponse.json();
      
      // Add to visuals
      setVisuals(prev => [...prev, {
        id: chunkId,
        imageData: imageData.imageData,
        mimeType: imageData.mimeType,
        timestamp: imageData.timestamp,
        transcriptSegment: chunk.transcriptSegment,
        refinedPrompt: refineData.refinedPrompt,
        chunkNumber: chunk.chunkNumber,
        selectedAssets: selectedAssetIds,
        usedReferences: imageData.usedReferences,
      }]);
      
      // Mark as complete
      setPendingChunks(prev => 
        prev.map(c => c.id === chunkId ? { ...c, status: "complete" as const } : c)
      );
      
    } catch (error) {
      console.error("Error processing chunk:", error);
      setPendingChunks(prev => 
        prev.map(c => c.id === chunkId ? { ...c, status: "error" as const } : c)
      );
    }
  }, [assets]);

  // Generate visual for manual mode
  const generateVisual = async (transcriptSegment: string) => {
    if (!transcriptSegment.trim() || isGeneratingVisual) return;
    
    setIsGeneratingVisual(true);
    try {
      // Step 1: Refine prompt (with asset selection)
      const assetMetadata = assets.map(a => ({
        id: a.id,
        name: a.name,
        description: a.description,
        tags: a.tags,
      }));
      
      const refineResponse = await fetch("/api/refine-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          transcript: transcriptSegment,
          assets: assetMetadata.length > 0 ? assetMetadata : undefined,
        }),
      });

      if (!refineResponse.ok) throw new Error("Failed to refine prompt");
      const refineData = await refineResponse.json();
      
      // Get selected assets
      const selectedAssetIds = refineData.selectedAssets || [];
      const selectedAssets = assets.filter(a => selectedAssetIds.includes(a.id));
      
      // Step 2: Generate image (with reference images)
      const referenceImages = selectedAssets.map(a => ({
        imageData: a.imageData,
        mimeType: a.mimeType,
        name: a.name,
      }));
      
      const imageResponse = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          prompt: refineData.refinedPrompt,
          referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
        }),
      });

      if (imageResponse.ok) {
        const imageData = await imageResponse.json();
        setVisuals((prev) => [
          ...prev,
          {
            id: `manual-${Date.now()}`,
            imageData: imageData.imageData,
            mimeType: imageData.mimeType,
            timestamp: imageData.timestamp,
            transcriptSegment,
            refinedPrompt: refineData.refinedPrompt,
            chunkNumber: 0,
            selectedAssets: selectedAssetIds,
            usedReferences: imageData.usedReferences,
          },
        ]);
      } else {
        const errorData = await imageResponse.json();
        alert(`Failed to generate image: ${errorData.error || "Please try again."}`);
      }
    } catch (error) {
      console.error("Error generating visual:", error);
      alert("Error generating image. Please check your API key and try again.");
    } finally {
      setIsGeneratingVisual(false);
    }
  };

  // Chunk the transcript and trigger generation (for live mode)
  const triggerChunkGeneration = useCallback((force: boolean = false) => {
    const currentTranscript = transcriptRef.current; // Use ref for latest value
    const newContent = currentTranscript.slice(lastChunkIndexRef.current).trim();
    
    // Trigger if we have enough content OR if forced (e.g., on stop)
    const shouldTrigger = force ? newContent.length > 20 : newContent.length >= MIN_CHUNK_CHARS;
    
    console.log(`[Chunk Check] New content: ${newContent.length} chars, threshold: ${MIN_CHUNK_CHARS}, trigger: ${shouldTrigger}`);
    
    if (shouldTrigger) {
      chunkCounterRef.current += 1;
      const chunkId = `chunk-${Date.now()}`;
      
      console.log(`[Chunk ${chunkCounterRef.current}] Triggering with ${newContent.length} chars`);
      
      const newChunk: PendingChunk = {
        id: chunkId,
        transcriptSegment: newContent,
        status: "pending",
        chunkNumber: chunkCounterRef.current,
        startTime: Date.now(),
      };
      
      setPendingChunks(prev => [...prev, newChunk]);
      lastChunkIndexRef.current = currentTranscript.length;
      
      // Process the chunk
      processChunk(newChunk);
    }
  }, [processChunk]);

  const clearTranscript = () => {
    setTranscript("");
    setInterimTranscript("");
    setVisuals([]);
    setPendingChunks([]);
    lastChunkIndexRef.current = 0;
    chunkCounterRef.current = 0;
  };

  // Live mode: Set up chunking interval
  useEffect(() => {
    if (isRecording && inputMode === "live" && autoGenerate) {
      recordingStartTimeRef.current = Date.now();
      lastChunkIndexRef.current = transcriptRef.current.length; // Start from current position
      
      console.log("[Live Mode] Starting pipeline, initial transcript length:", transcriptRef.current.length);
      
      // Timer for elapsed time display
      timerIntervalRef.current = setInterval(() => {
        if (recordingStartTimeRef.current) {
          const elapsed = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);
          setElapsedTime(elapsed);
          
          // Show time until next potential chunk (based on content, not just time)
          const newContentLength = transcriptRef.current.length - lastChunkIndexRef.current;
          const charsRemaining = Math.max(0, MIN_CHUNK_CHARS - newContentLength);
          setNextChunkIn(charsRemaining);
        }
      }, 100);
      
      // Check for chunks frequently - trigger when enough content is available
      chunkIntervalRef.current = setInterval(() => {
        triggerChunkGeneration();
      }, CHECK_INTERVAL_MS);
      
      return () => {
        console.log("[Live Mode] Cleaning up intervals");
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        if (chunkIntervalRef.current) clearInterval(chunkIntervalRef.current);
      };
    }
  }, [isRecording, inputMode, autoGenerate, triggerChunkGeneration]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isRecording) {
        stopRecording();
      }
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (chunkIntervalRef.current) clearInterval(chunkIntervalRef.current);
    };
  }, []);

  return (
    <div className="w-full max-w-4xl space-y-6">
      {/* Mode Selector */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-800">
        <button
          onClick={() => setInputMode("text")}
          className={`px-6 py-3 font-semibold transition-colors ${
            inputMode === "text"
              ? "border-b-2 border-purple-600 text-purple-600 dark:text-purple-400"
              : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
          }`}
        >
          📝 Text Input
        </button>
        <button
          onClick={() => setInputMode("record")}
          className={`px-6 py-3 font-semibold transition-colors ${
            inputMode === "record"
              ? "border-b-2 border-purple-600 text-purple-600 dark:text-purple-400"
              : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
          }`}
        >
          🎙️ Record Audio
        </button>
        <button
          onClick={() => setInputMode("live")}
          className={`px-6 py-3 font-semibold transition-colors ${
            inputMode === "live"
              ? "border-b-2 border-green-600 text-green-600 dark:text-green-400"
              : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
          }`}
        >
          🚀 Live Pipeline
        </button>
      </div>

      {/* Text Input Mode */}
      {inputMode === "text" && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Paste or type your content:
            </label>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Paste your presentation content here..."
              className="w-full h-48 px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
          </div>
          <div className="flex gap-4">
            {transcript && (
              <>
                <button
                  onClick={clearTranscript}
                  className="rounded-lg border border-gray-300 px-6 py-3 font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
                >
                  Clear
                </button>
                <button
                  onClick={() => generateVisual(transcript)}
                  disabled={isGeneratingVisual}
                  className="flex items-center gap-2 rounded-lg bg-purple-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isGeneratingVisual ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                      Generating...
                    </>
                  ) : (
                    <>
                      <span>✨</span>
                      Generate Visual
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Recording Mode */}
      {inputMode === "record" && (
        <div className="space-y-4">
          <div className="flex gap-4">
            {!isRecording ? (
              <button
                onClick={startRecording}
                disabled={isConnecting}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="h-3 w-3 rounded-full bg-white"></span>
                {isConnecting ? "Connecting..." : "Start Streaming"}
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="flex items-center gap-2 rounded-lg bg-gray-800 px-6 py-3 font-semibold text-white transition-colors hover:bg-gray-900"
              >
                <span className="h-3 w-3 rounded-sm bg-white"></span>
                Stop Streaming
              </button>
            )}

            {transcript && (
              <button
                onClick={clearTranscript}
                className="rounded-lg border border-gray-300 px-6 py-3 font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
              >
                Clear All
              </button>
            )}

            {transcript && !isRecording && (
              <button
                onClick={() => generateVisual(transcript)}
                disabled={isGeneratingVisual}
                className="flex items-center gap-2 rounded-lg bg-purple-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isGeneratingVisual ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    Generating...
                  </>
                ) : (
                  <>
                    <span>✨</span>
                    Generate Visual
                  </>
                )}
              </button>
            )}
          </div>

          {isRecording && (
            <div className="flex items-center gap-3 rounded-lg bg-green-50 p-4 dark:bg-green-950/20">
              <div className="h-4 w-4 animate-pulse rounded-full bg-green-600"></div>
              <span className="font-medium text-green-900 dark:text-green-400">
                Live streaming... Speak now!
              </span>
            </div>
          )}
        </div>
      )}

      {/* Live Pipeline Mode */}
      {inputMode === "live" && (
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-green-50 to-purple-50 dark:from-green-950/20 dark:to-purple-950/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
              🚀 <strong>Live Pipeline:</strong> Generates images WHILE you speak (~{MIN_CHUNK_CHARS} chars per chunk)
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Every ~10-15 seconds of speech → GPT-4o → Nano Banana Pro — images appear in real-time!
            </p>
          </div>

          <div className="flex gap-4 flex-wrap items-center">
            {!isRecording ? (
              <button
                onClick={startRecording}
                disabled={isConnecting}
                className="flex items-center gap-2 rounded-lg bg-green-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="h-3 w-3 rounded-full bg-white animate-pulse"></span>
                {isConnecting ? "Connecting..." : "Start Live Pipeline"}
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-red-700"
              >
                <span className="h-3 w-3 rounded-sm bg-white"></span>
                Stop Pipeline
              </button>
            )}

            {(transcript || visuals.length > 0) && !isRecording && (
              <button
                onClick={clearTranscript}
                className="rounded-lg border border-gray-300 px-6 py-3 font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
              >
                Clear All
              </button>
            )}
            
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={autoGenerate}
                onChange={(e) => setAutoGenerate(e.target.checked)}
                className="rounded"
              />
              Auto-generate images
            </label>
          </div>

          {/* Live Status Bar */}
          {isRecording && (
            <div className="bg-gray-900 rounded-lg p-4 text-white">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-red-500 animate-pulse"></div>
                  <span className="font-semibold">LIVE</span>
                  <span className="text-xs bg-green-600 px-2 py-0.5 rounded">
                    Generating while you speak
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-mono">
                    {Math.floor(elapsedTime / 60)}:{(elapsedTime % 60).toString().padStart(2, '0')}
                  </div>
                  <div className="text-xs text-gray-400">
                    {nextChunkIn > 0 
                      ? `${nextChunkIn} chars until next chunk` 
                      : "Ready to chunk!"}
                  </div>
                </div>
              </div>
              
              {/* Progress bar to next chunk - based on characters */}
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-green-500 to-purple-500 transition-all duration-100"
                  style={{ width: `${Math.min(100, ((MIN_CHUNK_CHARS - nextChunkIn) / MIN_CHUNK_CHARS) * 100)}%` }}
                />
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Chunks: {pendingChunks.length} | Images: {visuals.length}
              </div>
            </div>
          )}

          {/* Pipeline Queue */}
          {pendingChunks.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                🔄 Pipeline Queue ({pendingChunks.filter(c => c.status !== "complete").length} active)
              </h4>
              
              {/* Active chunks with details */}
              {pendingChunks.filter(c => c.status !== "complete").map((chunk) => (
                <div
                  key={chunk.id}
                  className={`rounded-lg p-3 border ${
                    chunk.status === "pending" ? "bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700" :
                    chunk.status === "refining" ? "bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-700" :
                    chunk.status === "generating" ? "bg-purple-50 dark:bg-purple-950/30 border-purple-300 dark:border-purple-700" :
                    "bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-700"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {chunk.status === "pending" && <span>⏳</span>}
                      {chunk.status === "refining" && <div className="h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />}
                      {chunk.status === "generating" && <div className="h-4 w-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />}
                      {chunk.status === "error" && <span>❌</span>}
                      <span className="font-semibold text-sm">Chunk {chunk.chunkNumber}</span>
                    </div>
                    <span className={`text-xs font-medium px-2 py-1 rounded ${
                      chunk.status === "refining" ? "bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200" :
                      chunk.status === "generating" ? "bg-purple-200 dark:bg-purple-800 text-purple-800 dark:text-purple-200" :
                      "bg-gray-200 dark:bg-gray-700"
                    }`}>
                      {chunk.status === "refining" ? "🧠 GPT-4o Processing" : 
                       chunk.status === "generating" ? "🎨 Generating Image" : 
                       chunk.status}
                    </span>
                  </div>
                  
                  {/* Show transcript being processed */}
                  <div className="text-xs text-gray-600 dark:text-gray-400 bg-white/50 dark:bg-black/20 rounded p-2 mb-2">
                    <span className="font-medium">Transcript:</span> {chunk.transcriptSegment.slice(0, 150)}{chunk.transcriptSegment.length > 150 ? "..." : ""}
                  </div>
                  
                  {/* Show refined prompt if available */}
                  {chunk.refinedPrompt && (
                    <div className="text-xs text-purple-700 dark:text-purple-300 bg-purple-100/50 dark:bg-purple-900/30 rounded p-2">
                      <span className="font-medium">GPT-4o Prompt:</span> {chunk.refinedPrompt}
                    </div>
                  )}
                </div>
              ))}
              
              {/* Completed chunks summary */}
              {pendingChunks.filter(c => c.status === "complete").length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {pendingChunks.filter(c => c.status === "complete").map((chunk) => (
                    <div
                      key={chunk.id}
                      className="px-3 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs font-medium flex items-center gap-1"
                    >
                      ✓ Chunk {chunk.chunkNumber}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Live Transcript */}
          {(transcript || interimTranscript) && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                📝 Live Transcript
              </h4>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 max-h-40 overflow-y-auto dark:border-gray-800 dark:bg-gray-900 text-sm">
                <p className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
                  {transcript}
                  {interimTranscript && (
                    <span className="text-gray-500 dark:text-gray-500 italic">
                      {interimTranscript}
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Results Section */}
      {(inputMode === "record" && (transcript || interimTranscript)) || visuals.length > 0 ? (
        <div className={`grid gap-6 ${visuals.length > 0 && inputMode !== "live" ? "lg:grid-cols-2" : "lg:grid-cols-1"}`}>
          {/* Transcript Section (Recording mode only) */}
          {inputMode === "record" && (transcript || interimTranscript) && (
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                📝 Real-time Transcript
              </h3>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 max-h-96 overflow-y-auto dark:border-gray-800 dark:bg-gray-900">
                <p className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
                  {transcript}
                  {interimTranscript && (
                    <span className="text-gray-500 dark:text-gray-500 italic">
                      {interimTranscript}
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Visuals Section */}
          {visuals.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  🎨 AI-Generated Images {inputMode === "live" && `(${visuals.length})`}
                </h3>
                {(isGeneratingVisual || pendingChunks.some(c => c.status === "generating")) && (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-purple-600 border-t-transparent"></div>
                )}
              </div>
              
              {/* Detailed cards for live mode, compact for others */}
              <div className={inputMode === "live" 
                ? "space-y-6" 
                : "space-y-4 max-h-96 overflow-y-auto"
              }>
              {visuals.map((visual, index) => (
                <div
                  key={visual.id || index}
                  className={inputMode === "live" 
                    ? "rounded-xl border-2 border-purple-300 bg-white dark:bg-gray-900 dark:border-purple-800 overflow-hidden shadow-lg"
                    : "rounded-lg border border-purple-200 bg-purple-50 p-3 dark:border-purple-900 dark:bg-purple-950/20"
                  }
                >
                  {inputMode === "live" ? (
                    <>
                      {/* Header */}
                      <div className="bg-purple-600 text-white px-4 py-2 flex items-center justify-between">
                        <span className="font-bold">Chunk {visual.chunkNumber || index + 1}</span>
                        <span className="text-xs opacity-80">
                          {new Date(visual.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      
                      <div className="grid md:grid-cols-2 gap-4 p-4">
                        {/* Left: Transcript & Prompt */}
                        <div className="space-y-4">
                          {/* Step 1: Original Transcript */}
                          <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded">1</span>
                              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                📝 Transcript Chunk
                              </span>
                            </div>
                            <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">
                              {visual.transcriptSegment}
                            </p>
                          </div>
                          
                          {/* Step 2: GPT-4o Prompt */}
                          <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="bg-purple-500 text-white text-xs font-bold px-2 py-0.5 rounded">2</span>
                              <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                                🧠 GPT-4o → Image Prompt
                              </span>
                            </div>
                            <p className="text-sm text-blue-900 dark:text-blue-100 italic leading-relaxed">
                              "{visual.refinedPrompt}"
                            </p>
                            {visual.selectedAssets && visual.selectedAssets.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-blue-200 dark:border-blue-700">
                                <span className="text-xs text-blue-600 dark:text-blue-400">
                                  🏦 Assets selected: {visual.selectedAssets.length} ({assets.filter(a => visual.selectedAssets?.includes(a.id)).map(a => a.name).join(', ')})
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Right: Generated Image */}
                        <div className="bg-purple-50 dark:bg-purple-950/30 rounded-lg p-3 border border-purple-200 dark:border-purple-800">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="bg-green-500 text-white text-xs font-bold px-2 py-0.5 rounded">3</span>
                            <span className="text-sm font-semibold text-purple-700 dark:text-purple-300">
                              🎨 Generated Image
                            </span>
                          </div>
                          <img
                            src={`data:${visual.mimeType};base64,${visual.imageData}`}
                            alt={`Generated visual ${index + 1}`}
                            className="w-full h-auto rounded-lg shadow-md"
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {visual.chunkNumber > 0 && (
                        <div className="text-xs font-semibold text-purple-600 dark:text-purple-400 mb-2">
                          Chunk {visual.chunkNumber}
                        </div>
                      )}
                      <img
                        src={`data:${visual.mimeType};base64,${visual.imageData}`}
                        alt={`Generated visual ${index + 1}`}
                        className="w-full h-auto rounded-lg mb-3"
                      />
                      {visual.refinedPrompt && (
                        <div className="mb-2 p-2 bg-purple-100 dark:bg-purple-900/30 rounded-md">
                          <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1">
                            💡 GPT-4o:
                          </p>
                          <p className="text-xs text-purple-800 dark:text-purple-200 italic line-clamp-3">
                            "{visual.refinedPrompt}"
                          </p>
                        </div>
                      )}
                      <details className="text-xs text-purple-600 dark:text-purple-400">
                        <summary className="cursor-pointer hover:text-purple-800 dark:hover:text-purple-300">
                          View transcript
                        </summary>
                        <p className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-gray-700 dark:text-gray-300 text-xs">
                          {visual.transcriptSegment}
                        </p>
                      </details>
                      <p className="text-[10px] text-purple-500 dark:text-purple-500 mt-2">
                        {new Date(visual.timestamp).toLocaleTimeString()}
                      </p>
                    </>
                  )}
                </div>
              ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

