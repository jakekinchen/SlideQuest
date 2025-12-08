/**
 * @fileoverview PDF.js worker configuration
 *
 * Imports the PDF.js worker module for processing PDF files in a Web Worker.
 * This is required for PDF.js to function properly and prevents blocking the main thread.
 *
 * Used by: pdfToImages.ts for converting PDF pages to images
 */
import 'pdfjs-dist/build/pdf.worker.mjs';
