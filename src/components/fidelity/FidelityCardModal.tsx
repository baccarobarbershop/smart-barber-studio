"use client";

import { useState, useEffect } from "react";
import { X, Gift, Scissors, Star, CheckCircle2, Award, Phone, Loader2, LogOut } from "lucide-react";
import { getCustomerFidelityCard, type FidelityCardInfo } from "@/app/actions/fidelity";

interface FidelityCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPhone?: string;
}

export function FidelityCardModal({
  isOpen,
  onClose,
  initialPhone = "",
}: FidelityCardModalProps) {
  const [phone, setPhone] = useState(initialPhone);
  const [isLoading, setIsLoading] = useState(false);
  const [card, setCard] = useState<FidelityCardInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const savedPhone =
        initialPhone ||
        (typeof window !== "undefined"
          ? localStorage.getItem("smart_barber_customer_phone") || ""
          : "");
      if (savedPhone) {
        setPhone(savedPhone);
        loadCard(savedPhone);
      }
    }
  }, [isOpen, initialPhone]);

  if (!isOpen) return null;

  const loadCard = async (phoneToLoad?: string) => {
    const target = phoneToLoad || phone;
    if (!target || target.trim().length < 6) {
      setErrorMessage("Inserisci un numero di telefono valido.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await getCustomerFidelityCard(target);
      if (!res.success || !res.card) {
        setErrorMessage(res.error || "Nessuna carta fedeltà trovata per questo numero.");
      } else {
        setCard(res.card);
      }
    } catch (e) {
      setErrorMessage("Errore durante il recupero della carta fedeltà.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="relative max-w-md w-full bg-zinc-950 border border-amber-500/30 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-5 my-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
            <Award className="w-4 h-4" />
            <span>Carta Fedeltà Digitale</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Input Ricerca se non caricata */}
        <div className="flex gap-2">
          <input
            type="tel"
            placeholder="Il tuo numero di telefono..."
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="flex-1 px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs font-semibold outline-none focus:border-amber-500"
          />
          <button
            type="button"
            disabled={isLoading}
            onClick={() => loadCard()}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition flex items-center gap-1.5"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verifica"}
          </button>
        </div>

        {errorMessage && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs text-center">
            {errorMessage}
          </div>
        )}

        {/* CARTA FEDELTÀ VISIVA (LUXURY GOLDEN MEMBER CARD) */}
        {card && (
          <div className="space-y-4 animate-in zoom-in-95 duration-200">
            <div className="relative overflow-hidden rounded-3xl p-6 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black border-2 border-amber-500/50 shadow-2xl shadow-amber-500/10 space-y-5">
              {/* Shimmer background glow */}
              <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="flex items-start justify-between relative z-10">
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-amber-400 font-extrabold block">
                    Exclusive VIP Member
                  </span>
                  <h3 className="text-lg font-black text-white">Smart Barber Club</h3>
                </div>
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-inner">
                  <Scissors className="w-5 h-5" />
                </div>
              </div>

              {/* Dati titolare */}
              <div className="relative z-10">
                <p className="text-[11px] text-zinc-400">Titolare tessera:</p>
                <p className="text-sm font-bold text-zinc-100">{card.customerName}</p>
                <p className="text-[10px] text-zinc-500 font-mono">{card.phone}</p>
              </div>

              {/* Griglia Timbri / Punti */}
              <div className="space-y-2 relative z-10">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400 font-medium">Progressi Punti Taglio:</span>
                  <span className="font-extrabold text-amber-400">
                    {card.fidelityPoints} / {card.targetPoints}
                  </span>
                </div>

                {/* Slot timbrati */}
                <div className="grid grid-cols-5 gap-2 pt-1">
                  {Array.from({ length: card.targetPoints }).map((_, idx) => {
                    const isStamped = idx < card.fidelityPoints;
                    const isLast = idx === card.targetPoints - 1;

                    return (
                      <div
                        key={idx}
                        className={`aspect-square rounded-2xl flex flex-col items-center justify-center transition-all duration-300 border ${
                          isStamped
                            ? "bg-amber-500/20 border-amber-400 text-amber-300 shadow-md shadow-amber-500/20 scale-105"
                            : isLast
                            ? "bg-amber-500/5 border-dashed border-amber-500/40 text-amber-500/40"
                            : "bg-zinc-900/60 border-dashed border-zinc-800 text-zinc-700"
                        }`}
                      >
                        {isStamped ? (
                          isLast ? (
                            <Gift className="w-5 h-5 text-amber-400 animate-pulse" />
                          ) : (
                            <Scissors className="w-4 h-4 text-amber-400" />
                          )
                        ) : isLast ? (
                          <Gift className="w-4 h-4 text-zinc-600" />
                        ) : (
                          <span className="text-[11px] font-bold text-zinc-600">{idx + 1}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Status Premio */}
              <div className="pt-2 border-t border-zinc-800/80 relative z-10">
                {card.isUnlocked ? (
                  <div className="p-3 rounded-2xl bg-amber-500/20 border border-amber-500 text-center space-y-1 shadow-lg shadow-amber-500/20">
                    <p className="text-xs font-black text-amber-300 flex items-center justify-center gap-1.5 uppercase tracking-wide">
                      <Gift className="w-4 h-4 text-amber-400" />
                      Premio Sbloccato!
                    </p>
                    <p className="text-xs font-bold text-white">{card.rewardDescription}</p>
                    <p className="text-[10px] text-zinc-300">
                      Comunicalo al barbiere al momento del prossimo appuntamento!
                    </p>
                  </div>
                ) : (
                  <div className="p-3 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex items-center gap-2.5">
                    <Gift className="w-5 h-5 text-amber-400 shrink-0" />
                    <div className="text-xs">
                      <span className="text-zinc-400 block">
                        Mancano ancora{" "}
                        <strong className="text-amber-400 font-bold">
                          {card.pointsRemaining} {card.pointsRemaining === 1 ? "taglio" : "tagli"}
                        </strong>{" "}
                        per:
                      </span>
                      <strong className="text-zinc-100">{card.rewardDescription}</strong>
                    </div>
                  </div>
                )}
              </div>

              {/* Azione Reset / Disconnessione per Test Pulito */}
              <div className="pt-2 border-t border-zinc-800/60 flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      localStorage.removeItem("smart_barber_customer_phone");
                      localStorage.removeItem("smart_barber_customer_name");
                      window.location.reload();
                    }
                  }}
                  className="text-xs text-zinc-500 hover:text-red-400 transition flex items-center gap-1.5 py-1.5 px-3 rounded-xl hover:bg-red-500/10 border border-transparent hover:border-red-500/20"
                >
                  <LogOut className="w-3.5 h-3.5 text-red-400" />
                  <span>Disconnetti questo numero (Torna a situazione pulita)</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

