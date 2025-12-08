/**
 * @fileoverview Root layout for Next.js application
 *
 * Configures global settings for the entire application:
 * - Font loading (Geist Sans and Geist Mono)
 * - HTML lang attribute
 * - Global CSS import
 * - Metadata (title, description, theme color)
 */

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

/** Geist Sans font with CSS variable for global use */
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

/** Geist Mono font with CSS variable for code blocks */
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Application metadata for SEO and browser chrome */
export const metadata: Metadata = {
  title: "SlideQuest",
  description: "Speak your ideas. Watch them become slides.",
  themeColor: "#ff6347",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
