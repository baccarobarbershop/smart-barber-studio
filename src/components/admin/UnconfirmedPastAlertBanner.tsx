"use client";

import { useState, useEffect } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  UserX,
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
} from "lucide-react";
import {
  checkUnconfirmedPastAppointments,
  batchCompleteAppointments,
  completeAppointment,
  markAppointmentNoShow,
} from "@/app/actions/admin";
import type { Appointment } from "@/types/database";

interface UnconfirmedPastAlertBannerProps {
  onRefresh?: () => void;
}

export function UnconfirmedPastAlertBanner({ onRefresh }: UnconfirmedPastAlertBannerProps) {
  const [unconfirmed, setUnconfirmed] = useState<Appointment[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const loadUnconfirmed = async () => {
    try {
      const list = await checkUnconfirmedPastAppointments();
      setUnconfirmed(list);
    } catch (e) {
      console.error("Errore verifica appuntamenti passati:", e);
    }
  };

  useEffect(() => {
    loadUnconfirmed();
    // Verifica ogni 60 secondi
    const interval = setInterval(loadUnconfirmed, 60000);
    return () => clearInterval(interval);
  }, []);

  if (unconfirmed.length === 0 && !successNotice) {
    return null;
  }

  const handleBatchConfirmAll = async () => {
    setBatchLoading(true);
    try {
      const ids = unconfirmed.map((a) => a.id);
      const res = await batchCompleteAppointments(ids);
      if (res.success) {
        setSuccessNotice(
          `🎉 ${res.completedCount} appuntamenti evasi con successo! Punti fedeltà accreditati ai rispettivi clienti.`
        );
        setUnconfirmed([]);
        setIsExpanded(false);
        onRefresh?.();
        setTimeout(() => setSuccessNotice(null), 4000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setBatchLoading(false);
    }
  };

  const handleSingleComplete = async (aptId: string) => {
    setProcessingId(aptId);
    try {
      const res = await completeAppointment(aptId);
      if (res.success) {
        setUnconfirmed((prev) => prev.filter((a) => a.id !== aptId));
        onRefresh?.();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setProcessingId(null);
    }
  };

  const handleSingleNoShow = async (aptId: string) => {
    if (!confirm("Confermi che il cliente non si è presentato (No-Show)? Non verranno assegnati punti.")) return;
    setProcessingId(aptId);
    try {
      const res = await markAppointmentNoShow(aptId);
      if (res.success) {
        setUnconfirmed((prev) => prev.filter((a) => a.id !== aptId));
        onRefresh?.();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-3">
      {successNotice && (
        <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successNotice}</span>
        </div>
      )}

      {unconfirmed.length > 0 && (
        <div className="p-4 sm:p-5 rounded-3xl bg-amber-500/10 border-2 border-amber-500/40 shadow-xl shadow-amber-500/5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                <Clock className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h4 className="text-sm font-extrabold text-amber-300 flex items-center gap-1.5">
                  <span>{unconfirmed.length} Appuntamenti Trascorsi da Evadere</span>
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                </h4>
                <p className="text-xs text-zinc-300 mt-0.5">
                  L'orario del taglio è terminato ma manca la tua conferma per accreditare i punti fedeltà ai clienti.
                </p>
              </div>
            </div>

            {/* Pulsanti Azione Rapida */}
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-semibold flex items-center gap-1.5 transition"
              >
                <span>Dettaglio ({unconfirmed.length})</span>
                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              <button
                type="button"
                disabled={batchLoading}
                onClick={handleBatchConfirmAll}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black flex items-center gap-1.5 transition shadow-md shadow-amber-500/20 disabled:opacity-50"
              >
                {batchLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                <span>Evadi Tutti (+Punti)</span>
              </button>
            </div>
          </div>

          {/* Dettaglio Espanso Appuntamenti da Evadere */}
          {isExpanded && (
            <div className="pt-3 border-t border-amber-500/20 space-y-2 animate-in fade-in duration-150">
              <p className="text-[11px] text-zinc-400">
                Puoi confermare l'avvenuto taglio singolarmente oppure segnare eventuali assenti:
              </p>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {unconfirmed.map((apt) => {
                  const isProcessing = processingId === apt.id;
                  const timeStr = apt.start_time.substring(0, 5);

                  return (
                    <div
                      key={apt.id}
                      className="p-3 rounded-2xl bg-zinc-950/80 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-amber-400">
                            {apt.appointment_date} ore {timeStr}
                          </span>
                          <span className="text-zinc-500">•</span>
                          <span className="font-bold text-zinc-100">{apt.customer_name}</span>
                          <span className="text-zinc-400 font-mono text-[11px]">
                            ({apt.customer_phone})
                          </span>
                        </div>
                        {apt.notes && (
                          <p className="text-zinc-500 text-[11px] mt-0.5 line-clamp-1">
                            Note: {apt.notes}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 self-end sm:self-auto">
                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => handleSingleComplete(apt.id)}
                          className="px-2.5 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 font-bold flex items-center gap-1 transition"
                        >
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>Eseguito (+1 Punto)</span>
                        </button>

                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => handleSingleNoShow(apt.id)}
                          className="px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-red-500/20 hover:border-red-500/30 text-zinc-400 hover:text-red-300 font-semibold flex items-center gap-1 transition"
                        >
                          <UserX className="w-3 h-3" />
                          <span>Assente</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

