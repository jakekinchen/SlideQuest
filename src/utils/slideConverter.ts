"use client";

// Dynamically import pdfjs-dist only on client side
let pdfjsLib: typeof import("pdfjs-dist") | null = null;

async function getPdfJs() {
  if (typeof window === "undefined") {
    throw new Error("PDF.js can only be used in the browser");
  }
  if (!pdfjsLib) {
    pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  }
  return pdfjsLib;
}

export interface ConvertedSlide {
  dataUrl: string;
  fileName: string;
  pageNumber?: number;
}

/**
 * Supported file types and their MIME types
 */
export const SUPPORTED_FILE_TYPES = {
  // Images
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  "image/heic": [".heic"],
  "image/heif": [".heif"],
  // Documents
  "application/pdf": [".pdf"],
  // PowerPoint
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
  "application/vnd.ms-powerpoint": [".ppt"],
  // Keynote (Apple)
  "application/x-iwork-keynote-sffkey": [".key"],
  "application/vnd.apple.keynote": [".key"],
};

/**
 * Get accepted file extensions for file input
 */
export function getAcceptedFileTypes(): string {
  const extensions = Object.values(SUPPORTED_FILE_TYPES).flat();
  const mimeTypes = Object.keys(SUPPORTED_FILE_TYPES);
  return [...extensions, ...mimeTypes].join(",");
}

/**
 * Check if a file is an image
 */
export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

/**
 * Check if a file is a PDF
 */
export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

/**
 * Check if a file is a PowerPoint file
 */
export function isPowerPointFile(file: File): boolean {
  const pptTypes = [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-powerpoint",
  ];
  return (
    pptTypes.includes(file.type) ||
    file.name.toLowerCase().endsWith(".pptx") ||
    file.name.toLowerCase().endsWith(".ppt")
  );
}

/**
 * Check if a file is a Keynote file
 */
export function isKeynoteFile(file: File): boolean {
  return (
    file.type.includes("keynote") ||
    file.name.toLowerCase().endsWith(".key")
  );
}

/**
 * Convert an image file to a data URL
 */
export async function imageToDataUrl(file: File): Promise<ConvertedSlide> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        dataUrl: reader.result as string,
        fileName: file.name,
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Convert a PDF file to an array of image data URLs (one per page)
 */
export async function pdfToImages(file: File, scale: number = 2.0): Promise<ConvertedSlide[]> {
  const pdfjs = await getPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;
  const slides: ConvertedSlide[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    // Create a canvas to render the page
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) {
      console.error("Could not get canvas context");
      continue;
    }

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvasContext: context,
      viewport: viewport,
      canvas: canvas,
    }).promise;

    const dataUrl = canvas.toDataURL("image/png");
    slides.push({
      dataUrl,
      fileName: `${file.name} - Page ${pageNum}`,
      pageNumber: pageNum,
    });
  }

  return slides;
}

/**
 * Convert any supported file to image data URLs
 * Returns an array since PDFs can have multiple pages
 */
export async function convertFileToImages(
  file: File,
  onProgress?: (message: string) => void
): Promise<ConvertedSlide[]> {
  onProgress?.(`Processing ${file.name}...`);

  // Handle images directly
  if (isImageFile(file)) {
    const slide = await imageToDataUrl(file);
    return [slide];
  }

  // Handle PDFs
  if (isPdfFile(file)) {
    onProgress?.(`Converting PDF pages...`);
    return await pdfToImages(file);
  }

  // Handle PowerPoint files - need server-side conversion
  if (isPowerPointFile(file)) {
    onProgress?.(`Converting PowerPoint file...`);
    return await convertPowerPointFile(file);
  }

  // Handle Keynote files - need server-side conversion
  if (isKeynoteFile(file)) {
    onProgress?.(`Converting Keynote file...`);
    return await convertKeynoteFile(file);
  }

  // Unknown file type - try to read as image
  console.warn(`Unknown file type: ${file.type}, attempting to process as image`);
  try {
    const slide = await imageToDataUrl(file);
    return [slide];
  } catch {
    throw new Error(`Unsupported file type: ${file.type}`);
  }
}

/**
 * Convert PowerPoint file via server API
 */
async function convertPowerPointFile(file: File): Promise<ConvertedSlide[]> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("format", "pptx");

  const response = await fetch("/api/convert-slides", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to convert PowerPoint: ${error}`);
  }

  const data = await response.json();
  return data.slides.map((slide: { dataUrl: string; pageNumber: number }) => ({
    dataUrl: slide.dataUrl,
    fileName: `${file.name} - Slide ${slide.pageNumber}`,
    pageNumber: slide.pageNumber,
  }));
}

/**
 * Convert Keynote file via server API
 */
async function convertKeynoteFile(file: File): Promise<ConvertedSlide[]> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("format", "key");

  const response = await fetch("/api/convert-slides", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to convert Keynote: ${error}`);
  }

  const data = await response.json();
  return data.slides.map((slide: { dataUrl: string; pageNumber: number }) => ({
    dataUrl: slide.dataUrl,
    fileName: `${file.name} - Slide ${slide.pageNumber}`,
    pageNumber: slide.pageNumber,
  }));
}

/**
 * Process multiple files and convert them all to images
 */
export async function convertFilesToImages(
  files: File[],
  onProgress?: (message: string, current: number, total: number) => void
): Promise<ConvertedSlide[]> {
  const allSlides: ConvertedSlide[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.(`Processing ${file.name}...`, i + 1, files.length);

    try {
      const slides = await convertFileToImages(file);
      allSlides.push(...slides);
    } catch (error) {
      console.error(`Failed to convert ${file.name}:`, error);
      // Continue with other files
    }
  }

  return allSlides;
}
