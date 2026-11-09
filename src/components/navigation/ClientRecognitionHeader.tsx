"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Award, Scissors, LogOut, Phone, Star, Sparkles, ChevronRight, Loader2, X } from "lucide-react";
import { getCustomerFidelityCard, type FidelityCardInfo } from "@/app/actions/fidelity";
import { FidelityCardModal } from "@/components/fidelity/FidelityCardModal";

export function ClientRecognitionHeader() {
  const pathname = usePathname();
  const [phone, setPhone] = useState<string | null>(null);
  const [card, setCard] = useState<FidelityCardInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFidelityModalOpen, setIsFidelityModalOpen] = useState(false);
  const [isPhonePromptOpen, setIsPhonePromptOpen] = useState(false);
  const [inputPhone, setInputPhone] = useState("");
  const [promptError, setPromptError] = useState<string | null>(null);

  // Nascondi nella dashboard admin per lasciare spazio pulito al barbiere
  const isAdmin = pathname?.startsWith("/admin");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedPhone = localStorage.getItem("smart_barber_customer_phone");
      if (savedPhone) {
        setPhone(savedPhone);
        loadCustomerCard(savedPhone);
      }
    }
  }, []);

  const loadCustomerCard = async (targetPhone: string) => {
    setIsLoading(true);
    try {
      const res = await getCustomerFidelityCard(targetPhone);
      if (res.success && res.card) {
        setCard(res.card);
        setPhone(targetPhone);
        if (typeof window !== "undefined") {
          localStorage.setItem("smart_barber_customer_phone", targetPhone.trim());
          if (res.card.customerName) {
            localStorage.setItem("smart_barber_customer_name", res.card.customerName);
          }
        }
      }
    } catch (e) {
      console.error("Errore caricamento tessera:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPhone || inputPhone.trim().length < 6) {
      setPromptError("Inserisci un numero di telefono valido (almeno 6 cifre).");
      return;
    }

    setIsLoading(true);
    setPromptError(null);
    try {
      const res = await getCustomerFidelityCard(inputPhone.trim());
      if (res.success && res.card) {
        setCard(res.card);
        setPhone(inputPhone.trim());
        setIsPhonePromptOpen(false);
        setInputPhone("");
        if (typeof window !== "undefined") {
          localStorage.setItem("smart_barber_customer_phone", inputPhone.trim());
          localStorage.setItem("smart_barber_customer_name", res.card.customerName);
        }
      } else {
        setPromptError(res.error || "Impossibile recuperare la tessera.");
      }
    } catch (err) {
      setPromptError("Errore durante il riconoscimento.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    setPhone(null);
    setCard(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("smart_barber_customer_phone");
      localStorage.removeItem("smart_barber_customer_name");
      window.location.reload();
    }
  };

  // Nascondi nella dashboard admin e nella home iniziale prima del login per non sovrapporsi alla card SMS
  if (isAdmin || (!card && pathname === "/")) return null;

  return (
    <>
      {/* Top Floating Recognition Bar */}
      <header className="w-full bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800/80 sticky top-0 z-40 px-3 py-2 text-xs transition">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
          {card ? (
            /* Badge Cliente Riconosciuto col punteggio attuale */
            <div className="flex items-center justify-between w-full">
              <button
                type="button"
                onClick={() => setIsFidelityModalOpen(true)}
                className="flex items-center gap-2 group hover:opacity-95 transition"
              >
                <div className="w-7 h-7 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 shadow-sm shadow-amber-500/20 group-hover:scale-105 transition">
                  <Scissors className="w-3.5 h-3.5" />
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-zinc-200 group-hover:text-amber-300 transition">
                      {card.customerName}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono hidden sm:inline">
                      ({card.phone})
                    </span>
                  </div>
                </div>
              </button>

              <div className="flex items-center gap-2">
                {card.isEnabled !== false && (
                  <button
                    type="button"
                    onClick={() => setIsFidelityModalOpen(true)}
                    className="px-2.5 py-1 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-extrabold flex items-center gap-1.5 transition shadow-sm"
                  >
                    <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                    <span>{card.fidelityPoints} / {card.targetPoints} Punti</span>
                    {card.isUnlocked && (
                      <span className="text-[10px] bg-amber-500 text-black px-1.5 py-0.2 rounded font-black uppercase">
                        Premio!
                      </span>
                    )}
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleLogout}
                  title="Disconnetti e cambia cliente"
                  className="px-2 py-1 rounded-xl bg-zinc-900 hover:bg-red-500/15 border border-zinc-800 hover:border-red-500/30 text-zinc-400 hover:text-red-300 font-semibold transition flex items-center gap-1.5 text-[11px]"
                >
                  <LogOut className="w-3.5 h-3.5 text-red-400" />
                  <span className="hidden sm:inline">Esci</span>
                </button>
              </div>
            </div>
          ) : (
            /* Pulsante per inserire il numero e sbloccare la tessera */
            <div className="flex items-center justify-between w-full">
              <button
                type="button"
                onClick={() => setIsPhonePromptOpen(true)}
                className="flex items-center gap-2 text-zinc-300 hover:text-amber-300 transition"
              >
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping shrink-0" />
                <span className="text-zinc-400 text-[11px] font-medium hidden sm:inline">
                  Sei già cliente?
                </span>
                <span className="text-amber-400 font-bold text-xs flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  Accedi con il Telefono per la Tessera Fedeltà
                  <ChevronRight className="w-3 h-3 text-amber-400" />
                </span>
              </button>

              <button
                type="button"
                onClick={() => setIsPhonePromptOpen(true)}
                className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-[11px] font-semibold transition"
              >
                I Miei Punti
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Modale Rapida Riconoscimento con Telefono */}
      {isPhonePromptOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative max-w-sm w-full bg-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2">
                <Scissors className="w-4 h-4" />
                Riconoscimento Cliente
              </h3>
              <button
                type="button"
                onClick={() => setIsPhonePromptOpen(false)}
                className="p-1 rounded-lg bg-zinc-900 text-zinc-400 hover:text-zinc-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              Nessuna password o registrazione complessa: inserisci solo il tuo numero di telefono per caricare la tua tessera punti e le tue prenotazioni!
            </p>

            {promptError && (
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
                {promptError}
              </div>
            )}

            <form onSubmit={handlePhoneSubmit} className="space-y-3">
              <div>
                <label className="text-[11px] text-zinc-400 font-semibold block mb-1">
                  Numero di Telefono:
                </label>
                <input
                  type="tel"
                  autoFocus
                  required
                  placeholder="Es. 347 1234567"
                  value={inputPhone}
                  onChange={(e) => setInputPhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-100 font-bold text-sm outline-none focus:border-amber-500"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>Carica la Mia Tessera Punti</span>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Tessera Fedeltà Completa */}
      <FidelityCardModal
        isOpen={isFidelityModalOpen}
        onClose={() => setIsFidelityModalOpen(false)}
        initialPhone={phone || ""}
      />
    </>
  );
}

