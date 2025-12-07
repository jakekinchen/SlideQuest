"use client";

import { useState } from "react";
import { SplashScreen } from "@/components/presentation/SplashScreen";
import { PresenterView } from "@/components/presentation/PresenterView";

export default function Home() {
  const [started, setStarted] = useState(false);

  if (!started) {
    return <SplashScreen onStart={() => setStarted(true)} />;
  }

  return <PresenterView onExit={() => setStarted(false)} />;
}
