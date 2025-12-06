"use client";

import { useState, useRef } from "react";

export interface Asset {
  id: string;
  name: string;
  description: string;
  tags: string[];
  imageData: string; // base64
  mimeType: string;
}

interface AssetBankProps {
  assets: Asset[];
  onAssetsChange: (assets: Asset[]) => void;
}

// SVG templates for demo icons (will be converted to PNG)
const DEMO_SVG_TEMPLATES = [
  {
    name: "Company Logo",
    description: "A modern tech company logo - use for branding and headers",
    tags: ["logo", "branding", "company"],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
      <defs><linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#8B5CF6"/><stop offset="100%" style="stop-color:#3B82F6"/></linearGradient></defs>
      <rect width="200" height="200" rx="40" fill="url(#g1)"/>
      <text x="100" y="120" font-family="Arial Black" font-size="80" fill="white" text-anchor="middle">LP</text>
    </svg>`,
  },
  {
    name: "Analytics Chart",
    description: "Data visualization chart - use for dashboards and analytics features",
    tags: ["chart", "analytics", "data", "dashboard"],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
      <rect width="200" height="200" fill="#1E293B"/>
      <rect x="20" y="120" width="30" height="60" fill="#3B82F6" rx="4"/>
      <rect x="60" y="80" width="30" height="100" fill="#8B5CF6" rx="4"/>
      <rect x="100" y="100" width="30" height="80" fill="#10B981" rx="4"/>
      <rect x="140" y="50" width="30" height="130" fill="#F59E0B" rx="4"/>
      <line x1="10" y1="180" x2="190" y2="180" stroke="#475569" stroke-width="2"/>
    </svg>`,
  },
  {
    name: "User Avatar",
    description: "Generic user profile icon - use for user-related features",
    tags: ["user", "profile", "avatar", "person"],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
      <rect width="200" height="200" fill="#E0E7FF"/>
      <circle cx="100" cy="70" r="40" fill="#6366F1"/>
      <ellipse cx="100" cy="180" rx="60" ry="50" fill="#6366F1"/>
    </svg>`,
  },
  {
    name: "Cloud Infrastructure",
    description: "Cloud/server icon - use for infrastructure, deployment, cloud features",
    tags: ["cloud", "server", "infrastructure", "deployment"],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
      <rect width="200" height="200" fill="#0F172A"/>
      <ellipse cx="100" cy="100" rx="70" ry="40" fill="#38BDF8"/>
      <ellipse cx="60" cy="90" rx="40" ry="25" fill="#38BDF8"/>
      <ellipse cx="140" cy="90" rx="40" ry="25" fill="#38BDF8"/>
      <ellipse cx="100" cy="80" rx="50" ry="30" fill="#38BDF8"/>
      <rect x="85" y="130" width="30" height="40" fill="#64748B"/>
      <rect x="70" y="160" width="60" height="20" fill="#475569" rx="4"/>
    </svg>`,
  },
  {
    name: "Mobile App UI",
    description: "Smartphone with app interface - use for mobile features",
    tags: ["mobile", "app", "phone", "ui"],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
      <rect width="200" height="200" fill="#F1F5F9"/>
      <rect x="60" y="20" width="80" height="160" rx="12" fill="#1E293B"/>
      <rect x="65" y="35" width="70" height="120" fill="#3B82F6"/>
      <rect x="70" y="40" width="60" height="20" fill="#1E40AF" rx="4"/>
      <rect x="70" y="65" width="60" height="40" fill="#DBEAFE" rx="4"/>
      <rect x="70" y="110" width="28" height="28" fill="#10B981" rx="4"/>
      <rect x="102" y="110" width="28" height="28" fill="#F59E0B" rx="4"/>
      <circle cx="100" cy="170" r="8" fill="#475569"/>
    </svg>`,
  },
  {
    name: "Security Shield",
    description: "Security/protection icon - use for security features, encryption, auth",
    tags: ["security", "shield", "protection", "auth"],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
      <rect width="200" height="200" fill="#ECFDF5"/>
      <path d="M100 20 L160 50 L160 100 C160 140 130 170 100 180 C70 170 40 140 40 100 L40 50 Z" fill="#10B981"/>
      <path d="M85 100 L95 110 L120 80" stroke="white" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  },
];

// Convert SVG to PNG using canvas
const svgToPng = (svgString: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const svgBlob = new Blob([svgString], { type: "image/svg+xml" });
    const url = URL.createObjectURL(svgBlob);
    
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 200;
      canvas.height = 200;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }
      ctx.drawImage(img, 0, 0, 200, 200);
      const pngDataUrl = canvas.toDataURL("image/png");
      // Remove the data:image/png;base64, prefix
      const base64 = pngDataUrl.split(",")[1];
      URL.revokeObjectURL(url);
      resolve(base64);
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load SVG"));
    };
    
    img.src = url;
  });
};

export default function AssetBank({ assets, onAssetsChange }: AssetBankProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [editingAsset, setEditingAsset] = useState<string | null>(null);
  const [isLoadingDemo, setIsLoadingDemo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDemoAssets = async () => {
    setIsLoadingDemo(true);
    try {
      const demoAssets: Asset[] = [];
      
      for (let i = 0; i < DEMO_SVG_TEMPLATES.length; i++) {
        const template = DEMO_SVG_TEMPLATES[i];
        try {
          const pngBase64 = await svgToPng(template.svg);
          demoAssets.push({
            id: `demo-${Date.now()}-${i}`,
            name: template.name,
            description: template.description,
            tags: template.tags,
            imageData: pngBase64,
            mimeType: "image/png",
          });
        } catch (err) {
          console.error(`Failed to convert ${template.name} to PNG:`, err);
        }
      }
      
      onAssetsChange([...assets, ...demoAssets]);
      console.log(`[AssetBank] Loaded ${demoAssets.length} demo assets as PNG`);
    } catch (err) {
      console.error("Error loading demo assets:", err);
    } finally {
      setIsLoadingDemo(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newAssets: Asset[] = [];

    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;

      const base64 = await fileToBase64(file);
      const asset: Asset = {
        id: `asset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: file.name.replace(/\.[^/.]+$/, ""),
        description: "",
        tags: [],
        imageData: base64,
        mimeType: file.type,
      };
      newAssets.push(asset);
    }

    onAssetsChange([...assets, ...newAssets]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove the data:image/xxx;base64, prefix
        resolve(result.split(",")[1]);
      };
      reader.onerror = reject;
    });
  };

  const updateAsset = (id: string, updates: Partial<Asset>) => {
    onAssetsChange(
      assets.map((a) => (a.id === id ? { ...a, ...updates } : a))
    );
  };

  const deleteAsset = (id: string) => {
    onAssetsChange(assets.filter((a) => a.id !== id));
  };

  const addTag = (id: string, tag: string) => {
    const asset = assets.find((a) => a.id === id);
    if (asset && tag && !asset.tags.includes(tag)) {
      updateAsset(id, { tags: [...asset.tags, tag] });
    }
  };

  const removeTag = (id: string, tag: string) => {
    const asset = assets.find((a) => a.id === id);
    if (asset) {
      updateAsset(id, { tags: asset.tags.filter((t) => t !== tag) });
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
          <span className="text-xl">🏦</span>
          <div className="text-left">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              Asset Bank
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {assets.length} assets • GPT-4o will select relevant ones
            </p>
          </div>
        </div>
        <span className="text-gray-400">{isExpanded ? "▼" : "▶"}</span>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-4 space-y-4 bg-white dark:bg-gray-950">
          {/* Upload Button */}
          <div className="flex gap-2 flex-wrap">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <span>➕</span> Add Assets
            </button>
            <button
              onClick={() => loadDemoAssets()}
              disabled={isLoadingDemo}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {isLoadingDemo ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Converting to PNG...
                </>
              ) : (
                <>
                  <span>🎨</span> Load Demo Icons
                </>
              )}
            </button>
            <p className="text-xs text-gray-500 dark:text-gray-400 self-center">
              Upload logos, UI screenshots, or try demo icons
            </p>
          </div>

          {/* Asset Grid */}
          {assets.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p className="text-4xl mb-2">📁</p>
              <p className="text-sm">No assets yet. Upload some images!</p>
              <p className="text-xs mt-1">
                Examples: Company logo, UI designs, product photos
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {assets.map((asset) => (
                <div
                  key={asset.id}
                  className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-900"
                >
                  {/* Image */}
                  <div className="aspect-square relative">
                    <img
                      src={`data:${asset.mimeType};base64,${asset.imageData}`}
                      alt={asset.name}
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={() => deleteAsset(asset.id)}
                      className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full w-6 h-6 text-xs flex items-center justify-center"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Details */}
                  <div className="p-2 space-y-2">
                    {editingAsset === asset.id ? (
                      <>
                        <input
                          type="text"
                          value={asset.name}
                          onChange={(e) =>
                            updateAsset(asset.id, { name: e.target.value })
                          }
                          className="w-full text-xs px-2 py-1 border rounded dark:bg-gray-800 dark:border-gray-700"
                          placeholder="Name"
                        />
                        <textarea
                          value={asset.description}
                          onChange={(e) =>
                            updateAsset(asset.id, { description: e.target.value })
                          }
                          className="w-full text-xs px-2 py-1 border rounded dark:bg-gray-800 dark:border-gray-700 resize-none"
                          placeholder="Description (helps GPT-4o understand when to use this)"
                          rows={2}
                        />
                        <input
                          type="text"
                          placeholder="Add tag + Enter"
                          className="w-full text-xs px-2 py-1 border rounded dark:bg-gray-800 dark:border-gray-700"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              addTag(asset.id, (e.target as HTMLInputElement).value);
                              (e.target as HTMLInputElement).value = "";
                            }
                          }}
                        />
                        <button
                          onClick={() => setEditingAsset(null)}
                          className="text-xs text-purple-600 hover:text-purple-700"
                        >
                          Done
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                          {asset.name}
                        </p>
                        {asset.description && (
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 line-clamp-2">
                            {asset.description}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-1">
                          {asset.tags.map((tag) => (
                            <span
                              key={tag}
                              className="text-[10px] bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded flex items-center gap-1"
                            >
                              {tag}
                              <button
                                onClick={() => removeTag(asset.id, tag)}
                                className="hover:text-red-500"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                        <button
                          onClick={() => setEditingAsset(asset.id)}
                          className="text-[10px] text-purple-600 hover:text-purple-700"
                        >
                          Edit details
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* How it works */}
          <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-900 rounded p-3">
            <strong>How it works:</strong> GPT-4o will analyze your transcript and select 
            relevant assets based on their names, descriptions, and tags. Selected assets 
            are passed to Nano Banana Pro as reference images for consistent branding.
          </div>
        </div>
      )}
    </div>
  );
}

