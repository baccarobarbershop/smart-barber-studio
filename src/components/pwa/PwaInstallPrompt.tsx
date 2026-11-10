"use client";

import React, { useEffect, useState } from "react";
import { Download, X, Share2, PlusSquare } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [dismissed, setDismissed] = useState(true); // default true until client mounts

  useEffect(() => {
    // Check if already installed
    const isStandaloneMode =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    setIsStandalone(isStandaloneMode);

    // Check if previously dismissed
    const isDismissed = localStorage.getItem("smart_barber_pwa_dismissed") === "true";
    if (isDismissed || isStandaloneMode) {
      setDismissed(true);
      return;
    }

    setDismissed(false);

    // Detect iOS
    const ua = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(ua);
    setIsIOS(isIosDevice);

    // Handle Android/Chrome beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choiceResult = await deferredPrompt.userChoice;
    if (choiceResult.outcome === "accepted") {
      setDismissed(true);
      localStorage.setItem("smart_barber_pwa_dismissed", "true");
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("smart_barber_pwa_dismissed", "true");
  };

  // Don't render if dismissed, already standalone, or neither promptable nor iOS
  if (dismissed || isStandalone || (!deferredPrompt && !isIOS)) {
    return null;
  }

  return (
    <aside aria-label="Installa applicazione" className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:w-96 z-50 animate-in fade-in slide-in-from-bottom duration-300">
      <div className="relative overflow-hidden rounded-2xl bg-zinc-900/95 border border-amber-500/40 p-4 shadow-2xl backdrop-blur-md">
        {/* Glow accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-600 via-amber-400 to-amber-600" />

        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0 mt-0.5">
            <Download className="w-5 h-5" />
          </div>

          <div className="flex-1 min-w-0 pr-6">
            <h4 className="text-sm font-semibold text-zinc-100 flex items-center gap-1.5">
              Installa Barbershop Baccaro App
            </h4>
            <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
              {isIOS ? (
                <span className="flex flex-col gap-1 mt-1">
                  <span>Accedi rapidamente dal tuo iPhone o iPad:</span>
                  <span className="inline-flex items-center gap-1 text-amber-300 font-medium">
                    1. Tocca Condividi <Share2 className="w-3.5 h-3.5 inline" />
                  </span>
                  <span className="inline-flex items-center gap-1 text-amber-300 font-medium">
                    2. Seleziona &quot;Aggiungi a schermata Home&quot; <PlusSquare className="w-3.5 h-3.5 inline" />
                  </span>
                </span>
              ) : (
                "Installa l'app sul tuo smartphone per prenotare in 1 click e visualizzare i tuoi punti fedeltà."
              )}
            </p>

            {!isIOS && deferredPrompt && (
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={handleInstallClick}
                  className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-zinc-950 font-semibold text-xs hover:from-amber-400 hover:to-amber-500 transition shadow-md flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Installa Ora
                </button>
                <button
                  onClick={handleDismiss}
                  className="px-3 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 text-xs transition"
                >
                  Più tardi
                </button>
              </div>
            )}

            {isIOS && (
              <div className="mt-2.5">
                <button
                  onClick={handleDismiss}
                  className="px-3 py-1 rounded-md bg-zinc-800 text-zinc-300 hover:text-white text-xs transition border border-zinc-700/60"
                >
                  Ho capito
                </button>
              </div>
            )}
          </div>

          {/* Close button */}
          <button
            onClick={handleDismiss}
            aria-label="Chiudi avviso installazione"
            className="absolute top-3 right-3 p-1 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

