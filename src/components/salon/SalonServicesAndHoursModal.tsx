"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { X, Clock, Scissors, Calendar, Sparkles, Check, ChevronRight, Loader2, Info, Palmtree } from "lucide-react";
import { getSalonPublicInfo, type SalonPublicInfo } from "@/app/actions/salon";
import type { BarberService } from "@/types/database";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";

interface SalonServicesAndHoursModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: "services" | "hours";
}

const DAYS_NAMES: Record<number, string> = {
  1: "Lunedì",
  2: "Martedì",
  3: "Mercoledì",
  4: "Giovedì",
  5: "Venerdì",
  6: "Sabato",
  0: "Domenica",
};

export function SalonServicesAndHoursModal({
  isOpen,
  onClose,
  initialTab = "services",
}: SalonServicesAndHoursModalProps) {
  const [activeTab, setActiveTab] = useState<"services" | "hours">(initialTab);
  const [info, setInfo] = useState<SalonPublicInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    const handleServicesUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<BarberService[]>;
      if (customEvent.detail && Array.isArray(customEvent.detail)) {
        setInfo((prev) =>
          prev
            ? { ...prev, services: customEvent.detail }
            : ({
                services: customEvent.detail,
                weeklySchedule: {} as any,
                upcomingExceptions: [],
                fidelityCardEnabled: true,
                fidelityRewardDescription: "",
                fidelityTargetPoints: 10,
                basePriceCents: 1800,
                salonPhone: "331 81 76 178",
                whatsappPhone: "331 81 76 178",
              } as unknown as SalonPublicInfo)
        );
      }
    };

    window.addEventListener("smart-barber-services-updated", handleServicesUpdated);
    return () => {
      window.removeEventListener("smart-barber-services-updated", handleServicesUpdated);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    // Carica subito da localStorage per reattività istantanea
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("smart_barber_services");
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setInfo((prev) =>
              prev
                ? { ...prev, services: parsed }
                : ({
                    services: parsed,
                    weeklySchedule: {} as any,
                    upcomingExceptions: [],
                    fidelityCardEnabled: true,
                    fidelityRewardDescription: "",
                    fidelityTargetPoints: 10,
                    basePriceCents: 1800,
                    salonPhone: "331 81 76 178",
                    whatsappPhone: "331 81 76 178",
                  } as unknown as SalonPublicInfo)
            );
          }
        } catch {}
      }
    }

    loadInfo();
  }, [isOpen]);

  const loadInfo = async () => {
    setIsLoading(true);
    try {
      const data = await getSalonPublicInfo();
      setInfo(data);
    } catch (e) {
      console.error("Errore caricamento info salone:", e);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const activeServices = (info?.services || []).filter((s) => s.enabled);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg glass-panel-gold rounded-3xl border border-amber-500/30 overflow-hidden shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
        role="dialog"
      >
        {/* Header con tabs */}
        <div className="p-4 sm:p-5 border-b border-zinc-800 bg-zinc-950/60 flex items-center justify-between shrink-0">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-widest text-amber-400">
              Barbershop Roberto Baccaro • Barberia &quot;Dal 1958&quot;
            </span>
            <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
              {activeTab === "services" ? (
                <>
                  <Scissors className="w-4 h-4 text-amber-400" />
                  Listino Prezzi & Trattamenti
                </>
              ) : (
                <>
                  <Clock className="w-4 h-4 text-amber-400" />
                  Orari di Apertura & Chiusure
                </>
              )}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="p-2 bg-zinc-950/80 border-b border-zinc-900 grid grid-cols-2 gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("services")}
            className={`py-2 px-3 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              activeTab === "services"
                ? "bg-amber-500 text-black shadow-md shadow-amber-500/20"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
            }`}
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>Listino Servizi</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("hours")}
            className={`py-2 px-3 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              activeTab === "hours"
                ? "bg-amber-500 text-black shadow-md shadow-amber-500/20"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Orari del Salone</span>
          </button>
        </div>

        {/* Content body scrollable */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center text-zinc-400 space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
              <span className="text-xs">Caricamento informazioni salone...</span>
            </div>
          ) : activeTab === "services" ? (
            /* LISTINO SERVIZI */
            <div className="space-y-3">
              <p className="text-xs text-zinc-400">
                Tutti i nostri trattamenti sono eseguiti con prodotti luxury esclusivi, panni caldi e styling personalizzato.
              </p>

              <div className="space-y-2.5">
                {activeServices.map((srv) => (
                  <div
                    key={srv.id}
                    className="p-3.5 rounded-2xl bg-zinc-900/70 border border-zinc-800/80 hover:border-amber-500/30 transition flex flex-col justify-between gap-2.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                          {srv.name}
                        </h4>
                        {srv.description && (
                          <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                            {srv.description}
                          </p>
                        )}
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-base font-black text-amber-400 font-mono">
                          {(srv.price_cents / 100).toFixed(2).replace(".00", "")} €
                        </span>
                        <div className="text-[10px] text-zinc-500 flex items-center justify-end gap-1 mt-0.5">
                          <Clock className="w-2.5 h-2.5 text-amber-500/70" />
                          <span>~{srv.duration_minutes} min</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-zinc-800/50 flex items-center justify-between">
                      <span className="text-[10px] text-zinc-500">
                        Include consulenza & styling finale
                      </span>
                      <Link
                        href="/chat"
                        onClick={onClose}
                        className="px-3 py-1 rounded-xl bg-amber-500/15 hover:bg-amber-500 text-amber-300 hover:text-black border border-amber-500/30 text-xs font-semibold flex items-center gap-1 transition"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Prenota Questo</span>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>

              {info?.fidelityCardEnabled && (
                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300/90 flex items-center gap-2.5 mt-3">
                  <span className="text-base">⭐</span>
                  <div>
                    <span className="font-bold">Programma Fedeltà Attivo: </span>
                    Ogni appuntamento completato ti fa accumulare 1 punto. Raggiungi {info.fidelityTargetPoints} punti per ottenere: <strong>{info.fidelityRewardDescription}</strong>!
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ORARI DI APERTURA & FERIE */
            <div className="space-y-4">
              <p className="text-xs text-zinc-400">
                Riceviamo a Torino in C.so Orbassano 230/a (presso &quot;Wild Effect&quot;). Tel. 331 81 76 178.
                <br />
                <span className="text-zinc-500 text-[11px]">È gradito l&apos;appuntamento per garantirti la massima puntualità e cura del dettaglio.</span>
              </p>

              {/* Tabella Orari */}
              <div className="rounded-2xl border border-zinc-800 overflow-hidden divide-y divide-zinc-800/70 bg-zinc-950/40">
                {[1, 2, 3, 4, 5, 6, 0].map((dayId) => {
                  const daySched = info?.weeklySchedule?.[dayId];
                  const dayName = DAYS_NAMES[dayId];
                  const isToday = new Date().getDay() === dayId;

                  return (
                    <div
                      key={dayId}
                      className={`px-3.5 py-2.5 flex items-center justify-between text-xs transition ${
                        isToday ? "bg-amber-500/10 font-bold" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={isToday ? "text-amber-400 font-bold" : "text-zinc-300"}>
                          {dayName}
                        </span>
                        {isToday && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 font-semibold border border-amber-500/30">
                            Oggi
                          </span>
                        )}
                      </div>

                      <div className="text-right">
                        {daySched && daySched.enabled ? (
                          <div className="space-y-0.5">
                            <span className="text-zinc-200 font-mono">
                              {daySched.opening_time?.substring(0, 5)} - {daySched.closing_time?.substring(0, 5)}
                            </span>
                            {daySched.has_lunch_break && daySched.lunch_break_start && daySched.lunch_break_end && (
                              <div className="text-[10px] text-zinc-500 font-mono">
                                Pausa: {daySched.lunch_break_start.substring(0, 5)} - {daySched.lunch_break_end.substring(0, 5)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-zinc-500 italic">Chiuso</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Chiusure Straordinarie / Ferie Imminenti */}
              {info?.upcomingExceptions && info.upcomingExceptions.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-zinc-900 border border-amber-500/30 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                    <Palmtree className="w-3.5 h-3.5" />
                    <span>Ferie & Chiusure Straordinarie Programmate</span>
                  </div>
                  <div className="space-y-1.5">
                    {info.upcomingExceptions.map((exc) => {
                      let dateFmt = exc.exception_date;
                      try {
                        dateFmt = format(parseISO(exc.exception_date), "EEEE d MMMM yyyy", { locale: it });
                      } catch {}
                      return (
                        <div
                          key={exc.id}
                          className="flex items-center justify-between text-xs text-zinc-300 py-1 border-b border-zinc-800 last:border-0"
                        >
                          <span className="capitalize font-medium">{dateFmt}</span>
                          <span className="text-[11px] px-2 py-0.5 rounded-md bg-red-500/10 text-red-400 border border-red-500/20 font-semibold">
                            {exc.reason || "Chiuso"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer con pulsante diretto per prenotare */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-950/80 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-semibold transition"
          >
            Chiudi
          </button>

          <Link
            href="/chat"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition shadow-lg shadow-amber-500/20"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Prenota un Appuntamento</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

