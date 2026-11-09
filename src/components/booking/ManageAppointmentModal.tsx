"use client";

import { useState, useEffect } from "react";
import { format, parse } from "date-fns";
import { it } from "date-fns/locale";
import {
  X,
  Calendar,
  Clock,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Phone,
  ArrowRight,
  RefreshCw,
  Trash2,
  MessageCircle,
} from "lucide-react";
import {
  findAppointmentsByPhone,
  cancelAppointmentByClient,
  rescheduleAppointmentByClient,
} from "@/app/actions/booking";
import { fetchDayAvailability } from "@/app/actions/availability";
import { FidelityCardModal } from "@/components/fidelity/FidelityCardModal";
import type { Appointment } from "@/types/database";
import type { TimeSlot } from "@/lib/booking/slots";
import { Award } from "lucide-react";

interface ManageAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessAction?: () => void;
}

export function ManageAppointmentModal({
  isOpen,
  onClose,
  onSuccessAction,
}: ManageAppointmentModalProps) {
  const [phone, setPhone] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [searched, setSearched] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [policyBlockInfo, setPolicyBlockInfo] = useState<{
    message: string;
    salonPhone?: string;
    whatsappPhone?: string;
  } | null>(null);
  const [isFidelityOpen, setIsFidelityOpen] = useState(false);

  // Stato per spostamento (reschedule)
  const [reschedulingApt, setReschedulingApt] = useState<Appointment | null>(null);
  const [newDate, setNewDate] = useState<string>("");
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [selectedNewSlot, setSelectedNewSlot] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Stato per disdetta
  const [cancellingApt, setCancellingApt] = useState<Appointment | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [submittingAction, setSubmittingAction] = useState(false);

  const handleSearch = async (phoneToSearch?: string) => {
    const targetPhone = phoneToSearch || phone;
    if (!targetPhone || targetPhone.trim().length < 6) {
      setActionError("Inserisci un numero di telefono valido.");
      return;
    }

    setIsLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await findAppointmentsByPhone(targetPhone);
      setAppointments(res);
      setSearched(true);
      if (typeof window !== "undefined") {
        localStorage.setItem("smart_barber_customer_phone", targetPhone.trim());
      }
    } catch (e) {
      setActionError("Errore durante la ricerca appuntamenti.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && typeof window !== "undefined") {
      const saved = localStorage.getItem("smart_barber_customer_phone");
      if (saved) {
        setPhone(saved);
        handleSearch(saved);
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOpenReschedule = async (apt: Appointment) => {
    const aptDateTime = parse(
      `${apt.appointment_date} ${apt.start_time.substring(0, 5)}`,
      "yyyy-MM-dd HH:mm",
      new Date()
    );
    if (aptDateTime.getTime() <= Date.now()) {
      setActionError("Questo appuntamento è già trascorso ed è concluso (freezato). Non può più essere modificato.");
      return;
    }
    setReschedulingApt(apt);
    setNewDate(apt.appointment_date);
    setSelectedNewSlot(null);
    loadSlotsForReschedule(apt.appointment_date);
  };

  const handleOpenCancel = (apt: Appointment) => {
    const aptDateTime = parse(
      `${apt.appointment_date} ${apt.start_time.substring(0, 5)}`,
      "yyyy-MM-dd HH:mm",
      new Date()
    );
    if (aptDateTime.getTime() <= Date.now()) {
      setActionError("Questo appuntamento è già trascorso ed è concluso (freezato). Non può più essere disdetto.");
      return;
    }
    setCancellingApt(apt);
  };

  const loadSlotsForReschedule = async (dateStr: string) => {
    setLoadingSlots(true);
    try {
      const res = await fetchDayAvailability(dateStr);
      setAvailableSlots(res.slots || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSlots(false);
    }
  };

  const confirmReschedule = async () => {
    if (!reschedulingApt || !newDate || !selectedNewSlot) {
      setActionError("Seleziona una data e un orario per lo spostamento.");
      return;
    }

    setSubmittingAction(true);
    setActionError(null);
    try {
      const res = await rescheduleAppointmentByClient({
        appointmentId: reschedulingApt.id,
        customerPhone: reschedulingApt.customer_phone,
        newDate,
        newTime: selectedNewSlot,
      });

      if (!res.success) {
        if (res.isBlockedByPolicy) {
          setPolicyBlockInfo({
            message: res.error || "Preavviso insufficiente per lo spostamento online.",
            salonPhone: res.salonPhone,
            whatsappPhone: res.whatsappPhone,
          });
          setReschedulingApt(null);
        } else {
          setActionError(res.error || "Impossibile spostare l'appuntamento.");
        }
      } else {
        setActionSuccess("Appuntamento spostato con successo! Il barbiere è stato allertato.");
        setReschedulingApt(null);
        handleSearch();
        onSuccessAction?.();
      }
    } catch (e) {
      setActionError("Errore durante lo spostamento.");
    } finally {
      setSubmittingAction(false);
    }
  };

  const confirmCancel = async () => {
    if (!cancellingApt) return;

    setSubmittingAction(true);
    setActionError(null);
    try {
      const res = await cancelAppointmentByClient({
        appointmentId: cancellingApt.id,
        customerPhone: cancellingApt.customer_phone,
        reason: cancelReason,
      });

      if (!res.success) {
        if (res.isBlockedByPolicy) {
          setPolicyBlockInfo({
            message: res.error || "Preavviso insufficiente per la disdetta online.",
            salonPhone: res.salonPhone,
            whatsappPhone: res.whatsappPhone,
          });
          setCancellingApt(null);
        } else {
          setActionError(res.error || "Impossibile disdire l'appuntamento.");
        }
      } else {
        setActionSuccess("Appuntamento disdetto. Il barbiere ha ricevuto la notifica urgente con allarme.");
        setCancellingApt(null);
        setCancelReason("");
        handleSearch();
        onSuccessAction?.();
      }
    } catch (e) {
      setActionError("Errore durante la disdetta.");
    } finally {
      setSubmittingAction(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="relative max-w-lg w-full bg-zinc-950 border border-zinc-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 my-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
            <Calendar className="w-4 h-4" />
            <span>Gestisci o Disdici Appuntamento</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {actionSuccess && (
          <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {actionError && (
          <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}

        {policyBlockInfo && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/40 text-xs space-y-3 animate-in fade-in">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold text-amber-300 text-xs uppercase tracking-wide">
                  Avviso Preavviso Salone
                </div>
                <p className="text-zinc-200 leading-relaxed">
                  {policyBlockInfo.message}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-amber-500/20">
              {policyBlockInfo.salonPhone && (
                <a
                  href={`tel:${policyBlockInfo.salonPhone.replace(/\D/g, "")}`}
                  className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-100 font-semibold flex items-center gap-1.5 transition"
                >
                  <Phone className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Chiama Salone ({policyBlockInfo.salonPhone})</span>
                </a>
              )}
              {policyBlockInfo.whatsappPhone && (
                <a
                  href={`https://wa.me/${policyBlockInfo.whatsappPhone.replace(/\D/g, "").startsWith("39")
                      ? policyBlockInfo.whatsappPhone.replace(/\D/g, "")
                      : "39" + policyBlockInfo.whatsappPhone.replace(/\D/g, "")
                    }?text=${encodeURIComponent(
                      "Ciao, vi contatto in merito alla disdetta del mio appuntamento."
                    )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 font-bold flex items-center gap-1.5 transition"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Scrivi su WhatsApp</span>
                </a>
              )}
              <button
                type="button"
                onClick={() => setPolicyBlockInfo(null)}
                className="px-3 py-1.5 rounded-xl text-zinc-400 hover:text-zinc-200 ml-auto transition"
              >
                Ho capito
              </button>
            </div>
          </div>
        )}

        {/* Form Ricerca Telefono */}
        {!reschedulingApt && !cancellingApt && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-400 font-medium flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-amber-400" />
                Numero di Telefono usato per la prenotazione:
              </label>
              <div className="flex gap-2">
                <input
                  type="tel"
                  placeholder="es. 333 1234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-sm font-semibold outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => handleSearch()}
                  className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition flex items-center gap-1.5"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Cerca"}
                </button>
              </div>

              {/* Pulsante rapido per visualizzare la Carta Fedeltà */}
              {phone && phone.trim().length >= 6 && (
                <div className="pt-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setIsFidelityOpen(true)}
                    className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 font-bold transition"
                  >
                    <Award className="w-3.5 h-3.5" />
                    <span>Visualizza la mia Carta Fedeltà VIP</span>
                  </button>
                </div>
              )}
            </div>

            {/* Risultati */}
            {searched && (
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-bold text-zinc-400">
                  I tuoi appuntamenti attivi ({appointments.length}):
                </h4>

                {appointments.length === 0 ? (
                  <div className="py-6 text-center text-xs text-zinc-500 border border-dashed border-zinc-800/80 rounded-2xl">
                    Nessun appuntamento attivo trovato per questo numero di telefono.
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
                    {appointments.map((apt) => {
                      const timeStr = apt.start_time.substring(0, 5);
                      const formattedDate = format(
                        new Date(`${apt.appointment_date}T00:00:00`),
                        "EEEE d MMMM yyyy",
                        { locale: it }
                      );
                      const aptDateTime = parse(
                        `${apt.appointment_date} ${timeStr}`,
                        "yyyy-MM-dd HH:mm",
                        new Date()
                      );
                      const isPast = aptDateTime.getTime() <= Date.now();

                      return (
                        <div
                          key={apt.id}
                          className={`p-3.5 rounded-2xl border space-y-3 transition ${isPast
                              ? "bg-zinc-950/70 border-zinc-800/60 opacity-80"
                              : "bg-zinc-900/90 border-zinc-800"
                            }`}
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <span className="text-xs font-bold text-amber-400 capitalize block">
                                {formattedDate}
                              </span>
                              <span className="text-sm font-black text-zinc-100">
                                Ore {timeStr}
                              </span>
                              <span className="text-xs text-zinc-400 block mt-0.5">
                                Cliente: {apt.customer_name}
                              </span>
                            </div>
                            {isPast ? (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-950/60 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
                                ❄️ Concluso (Freezato)
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                Confermato
                              </span>
                            )}
                          </div>

                          {isPast ? (
                            <div className="flex items-center justify-between p-2 rounded-xl bg-cyan-950/20 border border-cyan-500/20 text-[11px] text-cyan-300/80">
                              <span className="flex items-center gap-1.5 font-medium">
                                ❄️ Orario superato: non modificabile né disdicibile
                              </span>
                              <span className="text-[10px] uppercase font-bold tracking-wider text-cyan-400/90">
                                Freezato
                              </span>
                            </div>
                          ) : (
                            <div className="flex gap-2 pt-1 border-t border-zinc-800/60">
                              <button
                                type="button"
                                onClick={() => handleOpenReschedule(apt)}
                                className="flex-1 py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-300 text-xs font-bold border border-zinc-700 flex items-center justify-center gap-1.5 transition"
                              >
                                <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                                <span>Sposta Orario</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenCancel(apt)}
                                className="py-2 px-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs font-bold border border-red-500/30 flex items-center justify-center gap-1.5 transition"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                <span>Disdici</span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* VISTA SPOSTAMENTO (RESCHEDULE) */}
        {reschedulingApt && (
          <div className="space-y-4">
            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
              Spostamento appuntamento di <strong>{reschedulingApt.customer_name}</strong> (Attualmente: {reschedulingApt.appointment_date} ore {reschedulingApt.start_time.substring(0, 5)}).
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-zinc-400 font-medium">Nuova Data:</label>
              <input
                type="date"
                min={format(new Date(), "yyyy-MM-dd")}
                value={newDate}
                onChange={(e) => {
                  setNewDate(e.target.value);
                  setSelectedNewSlot(null);
                  loadSlotsForReschedule(e.target.value);
                }}
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs font-semibold outline-none focus:border-amber-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-zinc-400 font-medium">Seleziona Nuovo Orario Libero:</label>
              {loadingSlots ? (
                <div className="py-6 flex justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-1">
                  {availableSlots.filter((s) => s.available).map((s) => (
                    <button
                      key={s.time}
                      type="button"
                      onClick={() => setSelectedNewSlot(s.time)}
                      className={`py-2 px-1 rounded-xl text-xs font-bold text-center border transition ${selectedNewSlot === s.time
                          ? "bg-amber-500 text-black border-amber-400 shadow-md shadow-amber-500/30"
                          : "bg-zinc-900 border-zinc-800 text-zinc-200 hover:border-amber-500/50"
                        }`}
                    >
                      {s.time}
                    </button>
                  ))}
                  {availableSlots.filter((s) => s.available).length === 0 && (
                    <div className="col-span-full py-4 text-center text-xs text-zinc-500">
                      Nessun orario libero disponibile per questa data.
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setReschedulingApt(null)}
                className="flex-1 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100 text-xs font-bold transition"
              >
                Indietro
              </button>
              <button
                type="button"
                disabled={submittingAction || !selectedNewSlot}
                onClick={confirmReschedule}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 disabled:opacity-50"
              >
                {submittingAction ? <Loader2 className="w-4 h-4 animate-spin" /> : "Conferma Spostamento"}
              </button>
            </div>
          </div>
        )}

        {/* VISTA CONFERMA DISDETTA */}
        {cancellingApt && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                Conferma Disdetta Appuntamento
              </p>
              <p className="text-zinc-300">
                Stai per disdire l'appuntamento del <strong>{cancellingApt.appointment_date}</strong> alle ore <strong>{cancellingApt.start_time.substring(0, 5)}</strong>.
              </p>
              <p className="text-[11px] text-zinc-400">
                Lo slot tornerà immediatamente a disposizione di altri clienti e il salone riceverà un allarme di notifica urgente in tempo reale.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-zinc-400 font-medium">Motivo (opzionale):</label>
              <input
                type="text"
                placeholder="es. Imprevisto lavorativo..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setCancellingApt(null)}
                className="flex-1 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100 text-xs font-bold transition"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={submittingAction}
                onClick={confirmCancel}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md shadow-red-500/20 disabled:opacity-50"
              >
                {submittingAction ? <Loader2 className="w-4 h-4 animate-spin" /> : "Disdici Definitivamente"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Carta Fedeltà */}
      <FidelityCardModal
        isOpen={isFidelityOpen}
        onClose={() => setIsFidelityOpen(false)}
        initialPhone={phone}
      />
    </div>
  );
}

