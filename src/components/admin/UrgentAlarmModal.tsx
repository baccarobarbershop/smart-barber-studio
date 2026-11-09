"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { acknowledgeAlert, fetchPendingAlerts } from "@/app/actions/alerts";
import type { UrgentAlert } from "@/types/database";
import { BellRing, CheckCircle, Volume2, VolumeX, ShieldAlert, MessageSquare } from "lucide-react";

interface UrgentAlarmModalProps {
  initialAlerts?: UrgentAlert[];
  onOpenLiveChat?: (info: {
    sessionId: string;
    clientName: string;
    clientPhone?: string;
    directWhatsAppUrl?: string;
  }) => void;
}

export function UrgentAlarmModal({ initialAlerts = [], onOpenLiveChat }: UrgentAlarmModalProps) {
  const router = useRouter();
  const [alerts, setAlerts] = useState<UrgentAlert[]>(initialAlerts);
  const [activeAlert, setActiveAlert] = useState<UrgentAlert | null>(
    initialAlerts.length > 0 ? initialAlerts[0] : null
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const alarmIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Sintetizzatore Web Audio API per allarme sonoro persistente
  const playBeep = useCallback(() => {
    if (audioMuted) return;

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sawtooth";
      // Tono bitonale di allerta (880Hz / 440Hz)
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(659, ctx.currentTime + 0.15);

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch (e) {
      console.warn("Audio Context playback prevented or unsupported:", e);
    }
  }, [audioMuted]);

  // Avvio / Stop del suono continuo quando c'è un allarme attivo
  useEffect(() => {
    if (activeAlert) {
      playBeep();
      alarmIntervalRef.current = setInterval(() => {
        playBeep();
      }, 700); // Bip ogni 700ms
    } else {
      if (alarmIntervalRef.current) {
        clearInterval(alarmIntervalRef.current);
        alarmIntervalRef.current = null;
      }
    }

    return () => {
      if (alarmIntervalRef.current) {
        clearInterval(alarmIntervalRef.current);
      }
    };
  }, [activeAlert, playBeep]);

  // Ascolto in tempo reale su Supabase Realtime per la tabella urgent_alerts
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel("urgent_alerts_realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "urgent_alerts",
          filter: "status=eq.pending",
        },
        (payload) => {
          const newAlert = payload.new as UrgentAlert;
          setAlerts((prev) => [newAlert, ...prev]);
          setActiveAlert((prev) => prev || newAlert);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "urgent_alerts",
        },
        (payload) => {
          const updated = payload.new as UrgentAlert;
          if (updated.status === "acknowledged") {
            setAlerts((prev) => prev.filter((a) => a.id !== updated.id));
            setActiveAlert((prev) => {
              if (prev?.id === updated.id) {
                const remaining = alerts.filter((a) => a.id !== updated.id);
                return remaining.length > 0 ? remaining[0] : null;
              }
              return prev;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [alerts]);

  // Polling affidabile ogni 2 secondi per gli allarmi pendenti: rileva allarmi in tempo reale su qualsiasi dispositivo senza refresh
  useEffect(() => {
    let isMounted = true;
    const pollPendingAlerts = async () => {
      try {
        const pending = await fetchPendingAlerts();
        if (isMounted) {
          if (pending && pending.length > 0) {
            setAlerts(pending);
            setActiveAlert((prev) => {
              if (prev && pending.some((a) => a.id === prev.id)) return prev;
              return pending[0];
            });
          } else {
            setAlerts([]);
            setActiveAlert(null);
          }
        }
      } catch (err) {
        // ignora
      }
    };

    pollPendingAlerts();
    const interval = setInterval(pollPendingAlerts, 2000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Handler del pulsante fisico "PRESO IN CARICO"
  const handleAcknowledge = async () => {
    if (!activeAlert) return;
    setIsProcessing(true);

    try {
      const res = await acknowledgeAlert(activeAlert.id);

      // Rimuovi l'allarme gestito dallo stato
      const remaining = alerts.filter((a) => a.id !== activeAlert.id);
      setAlerts(remaining);
      setActiveAlert(remaining.length > 0 ? remaining[0] : null);

      // Se il cliente desidera parlare con il barbiere in chat:
      // Apri direttamente la Live Chat modale dentro il pannello Admin (senza uscire o aprire popup esterni)
      if (activeAlert.type === "human_support_request") {
        if (onOpenLiveChat) {
          onOpenLiveChat({
            sessionId: res.customerPhone?.replace(/\D/g, "") || activeAlert.user_id || "live_client",
            clientName: res.customerName || "Cliente",
            clientPhone: res.customerPhone,
            directWhatsAppUrl: res.directWhatsAppUrl,
          });
        }
      }
    } catch (err) {
      console.error("Errore acknowledge alert:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!activeAlert) return null;

  const isHumanSupport = activeAlert.type === "human_support_request";
  const isUrgentCancellation =
    activeAlert.type === "urgent_cancellation" || activeAlert.type === "urgent_reschedule";

  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-xl animate-pulse ${
      isHumanSupport ? "bg-emerald-950/90" : "bg-red-950/95"
    }`}>
      {/* Glow e sirene visive */}
      <div className={`absolute inset-0 bg-radial via-transparent to-black pointer-events-none ${
        isHumanSupport ? "from-emerald-600/30" : "from-red-600/30"
      }`} />

      <div className={`relative w-full max-w-lg rounded-3xl bg-zinc-950/95 border-2 p-6 sm:p-8 space-y-6 shadow-2xl text-center animate-in zoom-in duration-200 ${
        isHumanSupport
          ? "border-emerald-500 shadow-emerald-600/50"
          : "border-red-500 shadow-red-600/50"
      }`}>
        {/* Toggle silenziamento audio temporaneo per accessibilità */}
        <button
          type="button"
          onClick={() => setAudioMuted(!audioMuted)}
          className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-zinc-100 rounded-full bg-zinc-900 border border-zinc-800"
          title={audioMuted ? "Attiva suono" : "Disattiva suono"}
        >
          {audioMuted ? <VolumeX className="w-4 h-4 text-zinc-500" /> : <Volume2 className={`w-4 h-4 animate-bounce ${isHumanSupport ? "text-emerald-400" : "text-red-400"}`} />}
        </button>

        {/* Icona Allarme a Battito */}
        <div className={`w-20 h-20 rounded-full border-2 flex items-center justify-center mx-auto shadow-lg animate-bounce ${
          isHumanSupport
            ? "bg-emerald-600/20 border-emerald-500 text-emerald-400 shadow-emerald-500/40"
            : isUrgentCancellation
            ? "bg-red-600/20 border-red-500 text-red-400 shadow-red-500/40"
            : "bg-red-600/20 border-red-500 text-red-400 shadow-red-500/40"
        }`}>
          {isHumanSupport ? (
            <MessageSquare className="w-10 h-10" />
          ) : isUrgentCancellation ? (
            <ShieldAlert className="w-10 h-10" />
          ) : (
            <BellRing className="w-10 h-10" />
          )}
        </div>

        {/* Titolo e Dettagli */}
        <div className="space-y-2">
          <span className={`text-xs uppercase font-extrabold tracking-widest px-3 py-1 rounded-full border ${
            isHumanSupport
              ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
              : isUrgentCancellation
              ? "text-red-400 bg-red-500/10 border-red-500/30"
              : "text-amber-400 bg-amber-500/10 border-amber-500/30"
          }`}>
            {isHumanSupport
              ? "💬 IL CLIENTE CHIEDE DI PARLARE CON TE"
              : isUrgentCancellation
              ? "ALLERTA CRITICA < 24H"
              : "NOTIFICA IN TEMPO REALE"}
          </span>
          <h2 className="text-2xl sm:text-3xl font-black text-zinc-100 tracking-tight">
            {activeAlert.title}
          </h2>
          <p className="text-base sm:text-lg text-zinc-200 font-medium leading-snug">
            {activeAlert.message}
          </p>
        </div>

        {/* Numero allarmi in coda se più di uno */}
        {alerts.length > 1 && (
          <div className="text-xs text-amber-400 font-semibold bg-amber-500/10 py-1.5 px-3 rounded-lg border border-amber-500/20">
            Ci sono altri {alerts.length - 1} allarmi in attesa di presa in carico.
          </div>
        )}

        {/* Pulsante Critico Risolutivo: PRESO IN CARICO */}
        <div className="pt-2">
          <button
            type="button"
            disabled={isProcessing}
            onClick={handleAcknowledge}
            className={`w-full py-5 px-6 rounded-2xl text-lg sm:text-xl font-extrabold uppercase tracking-wide text-white shadow-2xl active:scale-95 transition-all duration-150 flex items-center justify-center gap-3 border-2 ${
              isHumanSupport
                ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-600/60 border-emerald-300"
                : "bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 shadow-red-600/60 border-red-300"
            }`}
          >
            {isHumanSupport ? (
              <>
                <MessageSquare className="w-6 h-6" />
                <span>{isProcessing ? "Apertura Chat..." : "PRENDI IN CARICO & VAI IN CHAT"}</span>
              </>
            ) : (
              <>
                <CheckCircle className="w-6 h-6" />
                <span>{isProcessing ? "Aggiornamento in corso..." : "PRESO IN CARICO"}</span>
              </>
            )}
          </button>
          <p className="text-[11px] text-zinc-400 mt-2">
            {isHumanSupport
              ? "L'allarme cesserà e verrai portato direttamente nella chat con il cliente."
              : "L'allarme sonoro e visivo cesserà solo dopo aver cliccato questo tasto."}
          </p>
        </div>
      </div>
    </div>
  );
}

