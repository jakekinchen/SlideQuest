import { SlideData } from "@/hooks/useRealtimeAPI";
import { getBgClass, getBgStyle, isLightColor } from "@/lib/slideColors";

interface SlideCanvasProps {
  slide: SlideData | null;
  isFullscreen?: boolean;
}

export function SlideCanvas({ slide, isFullscreen = false }: SlideCanvasProps) {
  if (!slide) {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-zinc-900 ${isFullscreen ? "min-h-screen" : ""}`}>
        <div className="text-center text-zinc-600">
          <div className="mb-4 text-6xl">...</div>
          <p className="text-xl">Waiting for first slide</p>
        </div>
      </div>
    );
  }

  if (slide.imageUrl) {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-black ${isFullscreen ? "min-h-screen" : ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={slide.imageUrl}
          alt="Presentation Slide"
          className="max-h-full max-w-full object-contain"
        />
      </div>
    );
  }

  // Special template for audience question slides
  if (slide.source === "question") {
    return (
      <div className={`flex h-full w-full flex-col items-center justify-center p-12 bg-blue-600 ${isFullscreen ? "min-h-screen" : ""}`}>
        <div className="max-w-5xl w-full">
          {/* Question Icon and Label */}
          <div className="mb-8 flex items-center justify-center gap-3">
            <svg className="h-12 w-12 text-blue-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-2xl font-semibold uppercase tracking-wider text-blue-200">
              Audience Question
            </span>
          </div>

          {/* Question Text */}
          <div className="rounded-2xl border-4 border-blue-400 bg-white p-12 shadow-2xl">
            <p className="text-center text-4xl font-bold leading-relaxed text-blue-900">
              {slide.headline}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const bgClass = getBgClass(slide.backgroundColor || "zinc");
  const bgStyle = getBgStyle(slide.backgroundColor || "zinc");
  const isLight = isLightColor(slide.backgroundColor || "zinc");

  return (
    <div
      className={`flex h-full w-full flex-col items-center justify-center p-12 ${bgClass} ${isFullscreen ? "min-h-screen" : ""}`}
      style={bgStyle}
    >
      <div className="max-w-4xl text-center">
        <h1 className={`mb-6 text-5xl font-bold leading-tight ${isLight ? "text-zinc-900" : "text-white"}`}>
          {slide.headline}
        </h1>
        {slide.subheadline && (
          <p className={`mb-8 text-2xl ${isLight ? "text-zinc-600" : "text-zinc-300"}`}>
            {slide.subheadline}
          </p>
        )}
        {slide.bullets && slide.bullets.length > 0 && (
          <ul className="space-y-4 text-left">
            {slide.bullets.map((bullet, i) => (
              <li key={i} className={`flex items-start gap-4 text-xl ${isLight ? "text-zinc-700" : "text-zinc-200"}`}>
                <span className={`mt-2 h-2 w-2 flex-shrink-0 rounded-full ${isLight ? "bg-zinc-400" : "bg-zinc-500"}`} />
                {bullet}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
