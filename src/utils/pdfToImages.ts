/**
 * @fileoverview PDF to slide images converter utility
 *
 * Converts PDF files to presentation slides by rendering each page to a canvas
 * and converting to base64 PNG data URLs. Uses PDF.js library with a Web Worker
 * to avoid blocking the main thread.
 *
 * Key features:
 * - High quality rendering (2.0 scale factor)
 * - Base64 data URLs (no external storage needed)
 * - Web Worker for non-blocking PDF processing
 * - Automatic slide metadata generation
 *
 * Memory considerations:
 * - Data URLs stored in memory (can be large for many pages)
 * - Each page rendered at 2x scale for retina displays
 * - Consider limiting pages or reducing scale for large PDFs
 *
 * Usage:
 * Called when user uploads PDF via file input in presenter interface.
 * Converted slides are added to pending slides queue for approval.
 */

import * as pdfjsLib from 'pdfjs-dist';
import type { SlideData } from '@/hooks/useRealtimeAPI';

/** PDF.js worker instance (initialized once on client-side) */
let pdfWorker: Worker | null = null;

/**
 * Initialize PDF.js worker on client-side.
 * Uses local worker file to avoid CDN fetch issues and CORS problems.
 * Worker runs PDF processing in separate thread to prevent UI blocking.
 */
if (typeof window !== 'undefined' && !pdfWorker) {
  try {
    pdfWorker = new Worker(new URL('./pdf.worker.ts', import.meta.url), {
      type: 'module',
    });
    pdfjsLib.GlobalWorkerOptions.workerPort = pdfWorker;
  } catch (err) {
    console.error('Failed to initialize PDF.js worker', err);
  }
}

/**
 * Converts a PDF file to an array of slide images.
 *
 * Process:
 * 1. Load PDF file from File object
 * 2. For each page:
 *    - Render to canvas at 2.0 scale (high quality)
 *    - Convert canvas to PNG data URL
 *    - Create SlideData object with imageUrl
 * 3. Return array of slides
 *
 * Scale factor (2.0): Optimized for retina displays.
 * Lower scale = smaller file size but lower quality.
 * Higher scale = better quality but more memory usage.
 *
 * @param file - PDF file from file input
 * @returns Promise resolving to array of SlideData objects
 * @throws Error if canvas context cannot be created or PDF is invalid
 *
 * @example
 * const slides = await convertPdfToSlides(pdfFile);
 * addSlides(slides); // Add to pending queue
 */
export async function convertPdfToSlides(file: File): Promise<SlideData[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const slides: SlideData[] = [];
  const numPages = pdf.numPages;

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);

    // Set scale for better quality
    const viewport = page.getViewport({ scale: 2.0 });

    // Create canvas
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Could not get canvas context');
    }

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    // Render PDF page to canvas
    const renderContext = {
      canvasContext: context,
      viewport: viewport,
      canvas: canvas,
    };
    await page.render(renderContext).promise;

    // Convert canvas to data URL
    const imageUrl = canvas.toDataURL('image/png');

    // Create slide data
    const slide: SlideData = {
      id: crypto.randomUUID(),
      imageUrl,
      originalIdea: {
        title: `Slide ${pageNum}`,
        content: `PDF slide ${pageNum} from ${file.name}`,
        category: 'pdf-upload',
      },
      timestamp: new Date().toISOString(),
      source: 'voice', // Mark as voice so it goes into the main queue
    };

    slides.push(slide);
  }

  return slides;
}
