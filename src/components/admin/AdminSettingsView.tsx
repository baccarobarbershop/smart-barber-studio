"use client";

import { useState, useEffect } from "react";
import type { BusinessSettings, WeeklySchedule, DaySchedule, CalendarException, BarberService } from "@/types/database";
import { DEFAULT_WEEKLY_SCHEDULE, DEFAULT_SERVICES } from "@/types/database";
import {
  updateAdminSettings,
  fetchCalendarExceptions,
  addCalendarException,
  removeCalendarException,
  addVacationPeriod,
  removeVacationRange,
} from "@/app/actions/admin";
import { Clock, Calendar, Gift, CreditCard, Save, CheckCircle2, Loader2, Copy, Sun, Moon, Palmtree, Plus, Trash2, Scissors, RefreshCw, Phone, MessageSquare, MessageCircle, Volume2, Bell } from "lucide-react";
import { playLuxuryBookingChime } from "@/lib/sound";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface AdminSettingsViewProps {
  initialSettings: BusinessSettings;
}

const DAYS_OF_WEEK = [
  { id: 1, label: "Lunedì" },
  { id: 2, label: "Martedì" },
  { id: 3, label: "Mercoledì" },
  { id: 4, label: "Giovedì" },
  { id: 5, label: "Venerdì" },
  { id: 6, label: "Sabato" },
  { id: 0, label: "Domenica" },
];

export function AdminSettingsView({ initialSettings }: AdminSettingsViewProps) {
  const [settings, setSettings] = useState<BusinessSettings>(initialSettings);
  const [weeklySchedule, setWeeklySchedule] = useState<WeeklySchedule>(() => {
    if (initialSettings.daily_schedules && Object.keys(initialSettings.daily_schedules).length > 0) {
      return initialSettings.daily_schedules;
    }
    const base: WeeklySchedule = { ...DEFAULT_WEEKLY_SCHEDULE };
    const openTime = initialSettings.opening_time ? initialSettings.opening_time.substring(0, 5) : "09:00";
    const closeTime = initialSettings.closing_time ? initialSettings.closing_time.substring(0, 5) : "19:30";
    const lunchStart = initialSettings.lunch_break_start ? initialSettings.lunch_break_start.substring(0, 5) : "13:00";
    const lunchEnd = initialSettings.lunch_break_end ? initialSettings.lunch_break_end.substring(0, 5) : "14:30";

    for (let i = 0; i <= 6; i++) {
      const isWorking = (initialSettings.working_days || [1, 2, 3, 4, 5, 6]).includes(i);
      base[i] = {
        enabled: isWorking,
        opening_time: openTime,
        closing_time: closeTime,
        has_lunch_break: Boolean(initialSettings.lunch_break_start && initialSettings.lunch_break_end),
        lunch_break_start: lunchStart,
        lunch_break_end: lunchEnd,
      };
    }
    return base;
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Gestione Listino Servizi & Trattamenti Personalizzati
  const [services, setServices] = useState<BarberService[]>(() => {
    if (initialSettings.services && Array.isArray(initialSettings.services) && initialSettings.services.length > 0) {
      return initialSettings.services;
    }
    return DEFAULT_SERVICES;
  });
  const [newServiceName, setNewServiceName] = useState("");
  const [newServicePrice, setNewServicePrice] = useState("18");
  const [newServiceDuration, setNewServiceDuration] = useState("30");
  const [newServiceDesc, setNewServiceDesc] = useState("");

  const updateService = (id: string, partial: Partial<BarberService>) => {
    setServices((prev) =>
      prev.map((srv) => (srv.id === id ? { ...srv, ...partial } : srv))
    );
  };

  const removeService = (id: string) => {
    setServices((prev) => prev.filter((srv) => srv.id !== id));
  };

  const handleAddService = () => {
    if (!newServiceName.trim()) return;
    const priceNumber = parseFloat(newServicePrice.replace(",", ".")) || 18;
    const durationNumber = parseInt(newServiceDuration) || 30;

    const newSrv: BarberService = {
      id: `srv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: newServiceName.trim(),
      price_cents: Math.round(priceNumber * 100),
      duration_minutes: durationNumber,
      description: newServiceDesc.trim() || undefined,
      enabled: true,
    };

    setServices((prev) => [...prev, newSrv]);
    setNewServiceName("");
    setNewServicePrice("18");
    setNewServiceDuration("30");
    setNewServiceDesc("");
  };

  const handleResetDefaultServices = () => {
    if (window.confirm("Vuoi ripristinare il listino prezzi ufficiale del salone (Taglio, Barba, Sopracciglia, Bimbo, ecc.)?")) {
      setServices(DEFAULT_SERVICES);
    }
  };

  // Gestione Chiusure Straordinarie & Ferie (Singolo giorno & Intervallo Ferie)
  const [exceptions, setExceptions] = useState<CalendarException[]>([]);
  const [isLoadingExceptions, setIsLoadingExceptions] = useState(false);
  const [closureMode, setClosureMode] = useState<"range" | "single">("range");
  
  // Singolo giorno
  const [newExceptionDate, setNewExceptionDate] = useState("");
  const [newExceptionReason, setNewExceptionReason] = useState("");
  
  // Intervallo ferie (più giorni)
  const [rangeStartDate, setRangeStartDate] = useState("");
  const [rangeEndDate, setRangeEndDate] = useState("");
  const [rangeReason, setRangeReason] = useState("Ferie Salone");

  const [isAddingException, setIsAddingException] = useState(false);
  const [exceptionActionError, setExceptionActionError] = useState<string | null>(null);

  const calculatedDaysCount = (() => {
    if (!rangeStartDate || !rangeEndDate) return 0;
    const start = new Date(`${rangeStartDate}T00:00:00`);
    const end = new Date(`${rangeEndDate}T00:00:00`);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0;
    return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  })();

  useEffect(() => {
    loadExceptions();
  }, []);

  const loadExceptions = async () => {
    setIsLoadingExceptions(true);
    try {
      const data = await fetchCalendarExceptions();
      setExceptions(data);
    } catch (e) {
      console.error("Errore fetchCalendarExceptions:", e);
    } finally {
      setIsLoadingExceptions(false);
    }
  };

  const handleAddException = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExceptionDate) return;
    setIsAddingException(true);
    setExceptionActionError(null);
    try {
      const res = await addCalendarException({
        exception_date: newExceptionDate,
        reason: newExceptionReason.trim() || "Chiusura Straordinaria",
        is_closed: true,
      });
      if (!res.success) {
        setExceptionActionError(res.error || "Impossibile salvare la chiusura.");
      } else {
        setNewExceptionDate("");
        setNewExceptionReason("");
        await loadExceptions();
      }
    } catch {
      setExceptionActionError("Errore durante il salvataggio.");
    } finally {
      setIsAddingException(false);
    }
  };

  const handleAddVacationRange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rangeStartDate || !rangeEndDate) return;
    setIsAddingException(true);
    setExceptionActionError(null);
    try {
      const res = await addVacationPeriod({
        startDate: rangeStartDate,
        endDate: rangeEndDate,
        reason: rangeReason.trim() || "Ferie Salone",
      });
      if (!res.success) {
        setExceptionActionError(res.error || "Impossibile salvare il periodo di ferie.");
      } else {
        setRangeStartDate("");
        setRangeEndDate("");
        setRangeReason("Ferie Salone");
        await loadExceptions();
      }
    } catch {
      setExceptionActionError("Errore durante il salvataggio.");
    } finally {
      setIsAddingException(false);
    }
  };

  const handleRemoveException = async (id: string) => {
    setExceptionActionError(null);
    try {
      const res = await removeCalendarException(id);
      if (res.success) {
        setExceptions((prev) => prev.filter((item) => item.id !== id));
      } else {
        setExceptionActionError(res.error || "Impossibile rimuovere la chiusura.");
      }
    } catch {
      setExceptionActionError("Errore durante la rimozione.");
    }
  };

  const handleRemoveRange = async (startDate: string, endDate: string) => {
    setExceptionActionError(null);
    try {
      const res = await removeVacationRange({ startDate, endDate });
      if (res.success) {
        await loadExceptions();
      } else {
        setExceptionActionError(res.error || "Impossibile rimuovere il periodo.");
      }
    } catch {
      setExceptionActionError("Errore durante la rimozione.");
    }
  };

  const updateDaySchedule = (dayId: number, partial: Partial<DaySchedule>) => {
    setWeeklySchedule((prev) => ({
      ...prev,
      [dayId]: {
        ...prev[dayId],
        ...partial,
      },
    }));
  };

  const copyMondayToWeekdays = () => {
    const mondaySched = weeklySchedule[1];
    if (!mondaySched) return;
    setWeeklySchedule((prev) => ({
      ...prev,
      2: { ...mondaySched },
      3: { ...mondaySched },
      4: { ...mondaySched },
      5: { ...mondaySched },
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);
    setErrorMessage(null);

    try {
      const activeWorkingDays = Object.entries(weeklySchedule)
        .filter(([, v]) => v.enabled)
        .map(([k]) => Number(k));

      const updatedData: Partial<BusinessSettings> = {
        ...settings,
        working_days: activeWorkingDays,
        daily_schedules: weeklySchedule,
        services: services,
      };

      const res = await updateAdminSettings(updatedData);
      if (!res.success) {
        setErrorMessage(res.error || "Errore nel salvataggio");
      } else {
        setSaveSuccess(true);
        if (typeof window !== "undefined") {
          localStorage.setItem("smart_barber_services", JSON.stringify(services));
          if (settings.salon_phone) localStorage.setItem("smart_barber_salon_phone", settings.salon_phone);
          if (settings.whatsapp_phone) localStorage.setItem("smart_barber_whatsapp_phone", settings.whatsapp_phone);
          window.dispatchEvent(new CustomEvent("smart-barber-services-updated", { detail: services }));
          window.dispatchEvent(new CustomEvent("smart-barber-contacts-updated", {
            detail: {
              salon_phone: settings.salon_phone,
              whatsapp_phone: settings.whatsapp_phone,
            }
          }));
          window.dispatchEvent(new Event("storage"));
        }
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Errore inatteso");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {saveSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Impostazioni aggiornate con successo! Nuovi orari e regole attivi immediatamente.</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
          {errorMessage}
        </div>
      )}

      {/* 1. GIORNI E ORARI LAVORATIVI (CONFIGURABILI PER SINGOLO GIORNO) */}
      <div className="glass-panel rounded-3xl p-6 border border-amber-500/20 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-zinc-800">
          <div>
            <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
              <Calendar className="w-4 h-4" />
              <span>Orari di Apertura per Singolo Giorno</span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Configura orario di apertura, chiusura e pausa pranzo per ciascun giorno della settimana.
            </p>
          </div>

          <button
            type="button"
            onClick={copyMondayToWeekdays}
            className="self-start sm:self-auto px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-amber-300 text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copia Lunedì su Mar-Ven</span>
          </button>
        </div>

        {/* Tabella / Lista per ogni giorno */}
        <div className="space-y-3">
          {DAYS_OF_WEEK.map((day) => {
            const sched = weeklySchedule[day.id] || {
              enabled: false,
              opening_time: "09:00",
              closing_time: "19:30",
              has_lunch_break: true,
              lunch_break_start: "13:00",
              lunch_break_end: "14:30",
            };

            return (
              <div
                key={day.id}
                className={`p-3.5 rounded-2xl border transition ${
                  sched.enabled
                    ? "bg-zinc-900/90 border-zinc-800"
                    : "bg-zinc-950/40 border-zinc-900/60 opacity-60"
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  {/* Nome Giorno e Switch Aperto/Chiuso */}
                  <div className="flex items-center gap-3 w-40">
                    <button
                      type="button"
                      onClick={() => updateDaySchedule(day.id, { enabled: !sched.enabled })}
                      className={`px-3 py-1 rounded-xl text-xs font-bold transition border ${
                        sched.enabled
                          ? "bg-amber-500 text-black border-amber-400 shadow-sm shadow-amber-500/20"
                          : "bg-zinc-900 text-zinc-500 border-zinc-800"
                      }`}
                    >
                      {sched.enabled ? "Aperto" : "Chiuso"}
                    </button>
                    <span className={`text-sm font-bold ${sched.enabled ? "text-zinc-100" : "text-zinc-500"}`}>
                      {day.label}
                    </span>
                  </div>

                  {sched.enabled ? (
                    <div className="flex-1 flex flex-wrap items-center gap-4 text-xs">
                      {/* Orario Apertura e Chiusura */}
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-400 font-medium">Orario:</span>
                        <input
                          type="time"
                          value={sched.opening_time.substring(0, 5)}
                          onChange={(e) =>
                            updateDaySchedule(day.id, { opening_time: e.target.value })
                          }
                          className="px-2 py-1 rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 font-bold outline-none focus:border-amber-500 text-xs"
                        />
                        <span className="text-zinc-500">-</span>
                        <input
                          type="time"
                          value={sched.closing_time.substring(0, 5)}
                          onChange={(e) =>
                            updateDaySchedule(day.id, { closing_time: e.target.value })
                          }
                          className="px-2 py-1 rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 font-bold outline-none focus:border-amber-500 text-xs"
                        />
                      </div>

                      {/* Pausa Pranzo */}
                      <div className="flex items-center gap-2 pl-3 border-l border-zinc-800">
                        <label className="flex items-center gap-1.5 cursor-pointer text-zinc-300 font-medium select-none">
                          <input
                            type="checkbox"
                            checked={sched.has_lunch_break}
                            onChange={(e) =>
                              updateDaySchedule(day.id, { has_lunch_break: e.target.checked })
                            }
                            className="rounded border-zinc-700 accent-amber-500"
                          />
                          <span>Pausa pranzo:</span>
                        </label>

                        {sched.has_lunch_break ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="time"
                              value={
                                sched.lunch_break_start
                                  ? sched.lunch_break_start.substring(0, 5)
                                  : "13:00"
                              }
                              onChange={(e) =>
                                updateDaySchedule(day.id, { lunch_break_start: e.target.value })
                              }
                              className="px-2 py-1 rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 font-semibold outline-none focus:border-amber-500 text-xs"
                            />
                            <span className="text-zinc-500">-</span>
                            <input
                              type="time"
                              value={
                                sched.lunch_break_end
                                  ? sched.lunch_break_end.substring(0, 5)
                                  : "14:30"
                              }
                              onChange={(e) =>
                                updateDaySchedule(day.id, { lunch_break_end: e.target.value })
                              }
                              className="px-2 py-1 rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 font-semibold outline-none focus:border-amber-500 text-xs"
                            />
                          </div>
                        ) : (
                          <span className="text-zinc-500 italic">Orario continuato</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-zinc-500 italic">Salone chiuso per riposo settimanale</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-2">
          <label className="text-zinc-400 font-medium text-xs block mb-1">
            Durata Slot Default per Appuntamento
          </label>
          <div className="flex gap-2">
            {[15, 20, 30, 45, 60].map((duration) => (
              <button
                key={duration}
                type="button"
                onClick={() => setSettings({ ...settings, slot_duration_minutes: duration })}
                className={`py-2 px-3.5 rounded-xl border text-xs font-bold transition ${
                  settings.slot_duration_minutes === duration
                    ? "bg-amber-500 text-black border-amber-400 shadow-md shadow-amber-500/20"
                    : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                }`}
              >
                {duration} min
              </button>
            ))}
          </div>
        </div>

        {/* Preavviso Minimo per Disdetta Online */}
        <div className="pt-3 border-t border-zinc-800/80 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <div>
              <label className="text-zinc-300 font-semibold text-xs block">
                Preavviso Minimo per Disdetta Online
              </label>
              <p className="text-[11px] text-zinc-400">
                Se il cliente tenta di disdire con meno preavviso, la cancellazione online viene bloccata e ricevi subito un&apos;allerta urgente con sirena e WhatsApp.
              </p>
            </div>
            <span className="text-xs font-bold text-amber-400">
              {(settings.min_cancellation_hours ?? 2) === 0
                ? "Disdetta sempre libera"
                : `Almeno ${settings.min_cancellation_hours ?? 2} ore prima`}
            </span>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {[
              { val: 0, label: "Libera (0 ore)" },
              { val: 1, label: "1 ora prima" },
              { val: 2, label: "2 ore prima (Consigliato)" },
              { val: 4, label: "4 ore prima" },
              { val: 12, label: "12 ore prima" },
              { val: 24, label: "24 ore prima" },
            ].map((opt) => (
              <button
                key={opt.val}
                type="button"
                onClick={() => setSettings({ ...settings, min_cancellation_hours: opt.val })}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition ${
                  (settings.min_cancellation_hours ?? 2) === opt.val
                    ? "bg-amber-500 text-black border-amber-400 shadow-md shadow-amber-500/20"
                    : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Finestra Massima di Prenotazione Anticipata */}
        <div className="pt-3 border-t border-zinc-800/80 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <div>
              <label className="text-zinc-300 font-semibold text-xs block">
                Finestra Massima di Prenotazione Anticipata
              </label>
              <p className="text-[11px] text-zinc-400">
                Limita fino a quanti giorni nel futuro i clienti e l&apos;assistente AI possono visualizzare orari e prenotare.
              </p>
            </div>
            <span className="text-xs font-bold text-amber-400">
              {settings.max_advance_booking_days ?? 14} Giorni
            </span>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {[
              { val: 7, label: "7 giorni (1 settimana)" },
              { val: 14, label: "14 giorni (Consigliato)" },
              { val: 21, label: "21 giorni (3 settimane)" },
              { val: 30, label: "30 giorni (1 mese)" },
            ].map((opt) => (
              <button
                key={opt.val}
                type="button"
                onClick={() => setSettings({ ...settings, max_advance_booking_days: opt.val })}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition ${
                  (settings.max_advance_booking_days ?? 14) === opt.val
                    ? "bg-amber-500 text-black border-amber-400 shadow-md shadow-amber-500/20"
                    : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. CHIUSURE STRAORDINARIE, FESTIVITÀ & FERIE */}
      <div className="glass-panel rounded-3xl p-6 border border-amber-500/20 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
            <Palmtree className="w-4 h-4" />
            <span>Ferie & Chiusure Straordinarie</span>
          </div>
          <span className="text-[11px] text-zinc-400">
            I giorni e i periodi impostati appariranno CHIUSI a clienti e all&apos;assistente AI
          </span>
        </div>

        {exceptionActionError && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
            {exceptionActionError}
          </div>
        )}

        {/* Selettore Modalità: Intervallo Ferie vs Singolo Giorno */}
        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-semibold text-zinc-300">
              Registra Nuova Chiusura o Ferie:
            </span>
            <div className="inline-flex items-center bg-zinc-950 p-1 rounded-xl border border-zinc-800 text-xs">
              <button
                type="button"
                onClick={() => setClosureMode("range")}
                className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                  closureMode === "range"
                    ? "bg-amber-500 text-black shadow-md shadow-amber-500/20"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Palmtree className="w-3.5 h-3.5" />
                <span>Periodo Ferie (Intervallo)</span>
              </button>
              <button
                type="button"
                onClick={() => setClosureMode("single")}
                className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                  closureMode === "single"
                    ? "bg-amber-500 text-black shadow-md shadow-amber-500/20"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Giorno Singolo</span>
              </button>
            </div>
          </div>

          {closureMode === "range" ? (
            /* Form Intervallo Date Ferie */
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">Data Inizio Ferie *</label>
                  <input
                    type="date"
                    value={rangeStartDate}
                    onChange={(e) => setRangeStartDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-700 text-zinc-100 text-xs outline-none focus:border-amber-500 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">Data Fine Ferie (Inclusa) *</label>
                  <input
                    type="date"
                    value={rangeEndDate}
                    onChange={(e) => setRangeEndDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-700 text-zinc-100 text-xs outline-none focus:border-amber-500 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">Motivazione (Visibile ai Clienti)</label>
                  <input
                    type="text"
                    placeholder="Es. Ferie Estive Salone"
                    value={rangeReason}
                    onChange={(e) => setRangeReason(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-700 text-zinc-100 text-xs outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <div className="text-xs text-amber-300 font-semibold">
                  {calculatedDaysCount > 0 ? (
                    <span>🌴 Durata periodo: <strong className="text-white">{calculatedDaysCount} giorni consecutivi</strong></span>
                  ) : (
                    <span className="text-zinc-500">Seleziona la data di inizio e fine per calcolare i giorni.</span>
                  )}
                </div>
                <button
                  type="button"
                  disabled={isAddingException || calculatedDaysCount <= 0}
                  onClick={handleAddVacationRange}
                  className="py-2.5 px-5 rounded-xl font-bold bg-amber-500 hover:bg-amber-400 text-black text-xs transition disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
                >
                  {isAddingException ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Palmtree className="w-4 h-4" />
                  )}
                  <span>
                    {calculatedDaysCount > 0
                      ? `Registra Ferie (${calculatedDaysCount} giorni)`
                      : "Registra Periodo Ferie"}
                  </span>
                </button>
              </div>
            </div>
          ) : (
            /* Form Giorno Singolo */
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">Data Chiusura</label>
                  <input
                    type="date"
                    value={newExceptionDate}
                    onChange={(e) => setNewExceptionDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-700 text-zinc-100 text-xs outline-none focus:border-amber-500 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">Motivazione</label>
                  <input
                    type="text"
                    placeholder="Es. Natale, Festa Patronale, ecc."
                    value={newExceptionReason}
                    onChange={(e) => setNewExceptionReason(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-700 text-zinc-100 text-xs outline-none focus:border-amber-500"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    disabled={isAddingException || !newExceptionDate}
                    onClick={handleAddException}
                    className="w-full py-2.5 px-3 rounded-xl font-bold bg-amber-500 hover:bg-amber-400 text-black text-xs transition disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20"
                  >
                    {isAddingException ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    <span>Aggiungi Giorno Chiuso</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Elenco Chiusure Configurate (con raggruppamento automatico ferie) */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-zinc-400">
            Chiusure & Ferie Attive in Calendario:
          </div>
          {isLoadingExceptions ? (
            <div className="flex items-center gap-2 text-xs text-zinc-500 py-3">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
              <span>Caricamento ferie e chiusure...</span>
            </div>
          ) : exceptions.length === 0 ? (
            <div className="p-3.5 rounded-2xl bg-zinc-950/60 border border-zinc-900 text-xs text-zinc-500 text-center italic">
              Nessuna chiusura programmata. Il salone seguirà il normale calendario settimanale.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {(() => {
                const sorted = [...exceptions].sort((a, b) =>
                  a.exception_date.localeCompare(b.exception_date)
                );
                interface GroupItem {
                  id: string;
                  startDate: string;
                  endDate: string;
                  daysCount: number;
                  reason: string;
                  isRange: boolean;
                }
                const groups: GroupItem[] = [];
                let current: {
                  startDate: string;
                  endDate: string;
                  reason: string;
                  id: string;
                } | null = null;

                for (const exc of sorted) {
                  if (!current) {
                    current = {
                      startDate: exc.exception_date,
                      endDate: exc.exception_date,
                      reason: exc.reason || "Chiusura Straordinaria",
                      id: exc.id,
                    };
                    continue;
                  }

                  const prevDate = new Date(`${current.endDate}T00:00:00`);
                  const currDate = new Date(`${exc.exception_date}T00:00:00`);
                  const diffDays = Math.round(
                    (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
                  );

                  if (diffDays === 1 && (exc.reason || "Chiusura Straordinaria") === current.reason) {
                    current.endDate = exc.exception_date;
                  } else {
                    const startD = new Date(`${current.startDate}T00:00:00`);
                    const endD = new Date(`${current.endDate}T00:00:00`);
                    const count =
                      Math.round((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                    groups.push({
                      id: current.id,
                      startDate: current.startDate,
                      endDate: current.endDate,
                      daysCount: count,
                      reason: current.reason,
                      isRange: count > 1,
                    });
                    current = {
                      startDate: exc.exception_date,
                      endDate: exc.exception_date,
                      reason: exc.reason || "Chiusura Straordinaria",
                      id: exc.id,
                    };
                  }
                }

                if (current) {
                  const startD = new Date(`${current.startDate}T00:00:00`);
                  const endD = new Date(`${current.endDate}T00:00:00`);
                  const count =
                    Math.round((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                  groups.push({
                    id: current.id,
                    startDate: current.startDate,
                    endDate: current.endDate,
                    daysCount: count,
                    reason: current.reason,
                    isRange: count > 1,
                  });
                }

                return groups.map((grp) => {
                  if (grp.isRange) {
                    let startFormatted = grp.startDate;
                    let endFormatted = grp.endDate;
                    try {
                      startFormatted = format(
                        new Date(`${grp.startDate}T00:00:00`),
                        "d MMMM yyyy",
                        { locale: it }
                      );
                      endFormatted = format(
                        new Date(`${grp.endDate}T00:00:00`),
                        "d MMMM yyyy",
                        { locale: it }
                      );
                    } catch {}

                    return (
                      <div
                        key={`${grp.startDate}-${grp.endDate}`}
                        className="p-3.5 rounded-2xl bg-zinc-900/90 border border-amber-500/30 flex items-center justify-between gap-3 text-xs shadow-sm"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-bold text-[10px] uppercase tracking-wider border border-amber-500/30">
                              🌴 Ferie ({grp.daysCount} gg)
                            </span>
                            <span className="font-bold text-zinc-100">{grp.reason}</span>
                          </div>
                          <div className="text-[11px] text-zinc-300">
                            Dal <strong className="text-white">{startFormatted}</strong> al{" "}
                            <strong className="text-white">{endFormatted}</strong>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveRange(grp.startDate, grp.endDate)}
                          title="Rimuovi questo periodo di ferie e riapri il calendario"
                          className="px-2.5 py-1.5 rounded-xl bg-zinc-950 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 border border-zinc-800 hover:border-red-500/30 transition flex items-center gap-1 text-[11px] font-semibold shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Rimuovi</span>
                        </button>
                      </div>
                    );
                  }

                  let singleFormatted = grp.startDate;
                  try {
                    singleFormatted = format(
                      new Date(`${grp.startDate}T00:00:00`),
                      "EEEE d MMMM yyyy",
                      { locale: it }
                    );
                  } catch {}

                  return (
                    <div
                      key={grp.id}
                      className="p-3.5 rounded-2xl bg-zinc-900/90 border border-zinc-800 flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="font-bold text-amber-300 capitalize">
                          {singleFormatted}
                        </div>
                        <div className="text-[11px] text-zinc-400">{grp.reason}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveException(grp.id)}
                        title="Rimuovi chiusura e riapri il salone"
                        className="p-2 rounded-xl bg-zinc-950 hover:bg-red-500/20 text-zinc-500 hover:text-red-400 border border-zinc-800 hover:border-red-500/30 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>
      </div>

      {/* 3. CARTA FEDELTÀ E DEFINIZIONE PREMI */}
      <div className="glass-panel rounded-3xl p-6 border border-amber-500/20 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
            <Gift className="w-4 h-4" />
            <span>Configurazione Carta Fedeltà & Premi Clienti</span>
          </div>

          {/* INTERRUTTORE ON/OFF CARTA FEDELTÀ */}
          <div className="flex items-center gap-3 bg-zinc-900/90 border border-zinc-800 px-3.5 py-1.5 rounded-2xl w-fit">
            <span className="text-xs font-semibold text-zinc-300">
              Programma Fedeltà:
            </span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.fidelity_card_enabled !== false}
                onChange={(e) =>
                  setSettings({ ...settings, fidelity_card_enabled: e.target.checked })
                }
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 peer-checked:after:bg-black after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
              <span className={`ml-2 text-xs font-bold ${settings.fidelity_card_enabled !== false ? "text-amber-400" : "text-zinc-500"}`}>
                {settings.fidelity_card_enabled !== false ? "ATTIVA" : "DISATTIVATA"}
              </span>
            </label>
          </div>
        </div>

        {settings.fidelity_card_enabled === false && (
          <div className="p-3.5 rounded-2xl bg-zinc-900/80 border border-amber-500/20 text-xs text-zinc-400 flex items-center gap-2">
            <span className="text-amber-400 font-bold text-sm">ℹ️</span>
            <span>
              La carta fedeltà è <strong>disattivata</strong>: ai clienti non verrà mostrato il badge dei punti nella barra superiore e l&apos;assistente AI non menzionerà la raccolta punti.
            </span>
          </div>
        )}

        <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs transition ${settings.fidelity_card_enabled === false ? "opacity-40 pointer-events-none" : ""}`}>
          <div>
            <label className="text-zinc-300 font-semibold block mb-1">
              Soglia Appuntamenti per Applicare il Premio
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="50"
                value={settings.fidelity_target_points}
                onChange={(e) =>
                  setSettings({ ...settings, fidelity_target_points: parseInt(e.target.value) || 10 })
                }
                className="w-24 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-amber-400 font-black text-base outline-none focus:border-amber-500 text-center"
              />
              <span className="text-zinc-400">appuntamenti completati</span>
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">
              Al raggiungimento di questa soglia, il cliente matura il premio configurato.
            </p>
          </div>

          <div>
            <label className="text-zinc-300 font-semibold block mb-1">
              Definizione del Premio (Testo Visibile al Cliente)
            </label>
            <input
              type="text"
              value={settings.fidelity_reward_description}
              onChange={(e) =>
                setSettings({ ...settings, fidelity_reward_description: e.target.value })
              }
              placeholder="Es. Taglio Gratuito + Trattamento Barba Luxury"
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-100 font-medium outline-none focus:border-amber-500"
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              Descrizione personalizzata del vantaggio (es. sconto o servizio omaggio).
            </p>
          </div>
        </div>

        {/* Finestra Massima di Prenotazione Anticipata */}
        <div className="pt-3 border-t border-zinc-800/80 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <div>
              <label className="text-zinc-300 font-semibold text-xs block">
                Finestra Massima di Prenotazione Anticipata
              </label>
              <p className="text-[11px] text-zinc-400">
                Limita fino a quanti giorni nel futuro i clienti e l&apos;assistente AI possono visualizzare orari e prenotare.
              </p>
            </div>
            <span className="text-xs font-bold text-amber-400">
              {settings.max_advance_booking_days ?? 14} Giorni
            </span>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {[
              { val: 7, label: "7 giorni (1 settimana)" },
              { val: 14, label: "14 giorni (Consigliato)" },
              { val: 21, label: "21 giorni (3 settimane)" },
              { val: 30, label: "30 giorni (1 mese)" },
            ].map((opt) => (
              <button
                key={opt.val}
                type="button"
                onClick={() => setSettings({ ...settings, max_advance_booking_days: opt.val })}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition ${
                  (settings.max_advance_booking_days ?? 14) === opt.val
                    ? "bg-amber-500 text-black border-amber-400 shadow-md shadow-amber-500/20"
                    : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 4. LISTINO SERVIZI & PREZZI (TAGLIO, BARBA, SHAMPOO, COMBO, ECC.) */}
      <div className="glass-panel rounded-3xl p-6 border border-amber-500/20 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-zinc-800">
          <div>
            <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
              <Scissors className="w-4 h-4" />
              <span>Listino Servizi & Prezzi Personalizzabili</span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Configura i trattamenti del salone (Taglio, Barba, Shampoo, Trattamenti combo, ecc.) consultabili dai clienti e noti all&apos;assistente AI.
            </p>
          </div>

          <button
            type="button"
            onClick={handleResetDefaultServices}
            className="self-start sm:self-auto px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-amber-300 text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Ripristina Servizi Consigliati</span>
          </button>
        </div>

        {/* Elenco Servizi Configurate */}
        <div className="space-y-3">
          {services.map((srv, idx) => (
            <div
              key={srv.id || idx}
              className={`p-4 rounded-2xl border transition ${
                srv.enabled
                  ? "bg-zinc-900/80 border-zinc-800 hover:border-amber-500/30"
                  : "bg-zinc-950/60 border-zinc-900 opacity-50"
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2.5">
                <div className="flex items-center gap-2.5 flex-1">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 text-xs font-black">
                    #{idx + 1}
                  </div>
                  <input
                    type="text"
                    value={srv.name}
                    onChange={(e) => updateService(srv.id, { name: e.target.value })}
                    placeholder="Nome Servizio (es. Taglio Capelli Luxury)"
                    className="font-bold text-sm text-zinc-100 bg-transparent border-b border-transparent hover:border-zinc-700 focus:border-amber-500 outline-none w-full px-1"
                  />
                </div>

                <div className="flex items-center gap-3 self-end sm:self-auto">
                  {/* Switch Abilitato */}
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={srv.enabled}
                      onChange={(e) => updateService(srv.id, { enabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 peer-checked:after:bg-black after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                    <span className="ml-2 text-[11px] font-bold text-zinc-400">
                      {srv.enabled ? "Attivo" : "Nascosto"}
                    </span>
                  </label>

                  {/* Pulsante Elimina */}
                  <button
                    type="button"
                    onClick={() => removeService(srv.id)}
                    title="Elimina questo servizio"
                    className="p-1.5 rounded-lg bg-zinc-900 hover:bg-red-500/20 text-zinc-500 hover:text-red-400 border border-zinc-800 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Dettagli Prezzo, Durata e Descrizione */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs pt-1">
                <div className="sm:col-span-3">
                  <label className="text-[11px] text-zinc-400 block mb-1">Prezzo (€)</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={srv.price_cents / 100}
                      onChange={(e) =>
                        updateService(srv.id, {
                          price_cents: Math.round(parseFloat(e.target.value || "0") * 100),
                        })
                      }
                      className="w-full px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-amber-400 font-extrabold outline-none focus:border-amber-500"
                    />
                    <span className="text-zinc-500 font-bold">€</span>
                  </div>
                </div>

                <div className="sm:col-span-3">
                  <label className="text-[11px] text-zinc-400 block mb-1">Durata (Minuti)</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      step="5"
                      min="5"
                      max="180"
                      value={srv.duration_minutes}
                      onChange={(e) =>
                        updateService(srv.id, {
                          duration_minutes: parseInt(e.target.value) || 30,
                        })
                      }
                      className="w-full px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 font-bold outline-none focus:border-amber-500"
                    />
                    <span className="text-zinc-500">min</span>
                  </div>
                </div>

                <div className="sm:col-span-6">
                  <label className="text-[11px] text-zinc-400 block mb-1">Descrizione Trattamento</label>
                  <input
                    type="text"
                    value={srv.description || ""}
                    onChange={(e) => updateService(srv.id, { description: e.target.value })}
                    placeholder="Es. Taglio con forbice, styling cera, massaggio..."
                    className="w-full px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-300 outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Card Aggiungi Nuovo Servizio */}
        <div className="p-4 rounded-2xl bg-zinc-900/40 border border-dashed border-amber-500/30 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
            <Plus className="w-3.5 h-3.5" />
            <span>Aggiungi un Nuovo Servizio o Pacchetto</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs">
            <div className="sm:col-span-4">
              <label className="text-[11px] text-zinc-400 block mb-1">Nome Trattamento *</label>
              <input
                type="text"
                value={newServiceName}
                onChange={(e) => setNewServiceName(e.target.value)}
                placeholder="Es. Solo Barba / Taglio & Shampoo"
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 font-semibold outline-none focus:border-amber-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-[11px] text-zinc-400 block mb-1">Prezzo (€) *</label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={newServicePrice}
                onChange={(e) => setNewServicePrice(e.target.value)}
                placeholder="25"
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-amber-400 font-bold outline-none focus:border-amber-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-[11px] text-zinc-400 block mb-1">Durata (min) *</label>
              <input
                type="number"
                step="5"
                min="5"
                value={newServiceDuration}
                onChange={(e) => setNewServiceDuration(e.target.value)}
                placeholder="30"
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 outline-none focus:border-amber-500"
              />
            </div>

            <div className="sm:col-span-4 flex items-end">
              <button
                type="button"
                onClick={handleAddService}
                disabled={!newServiceName.trim()}
                className="w-full py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-bold flex items-center justify-center gap-1.5 transition text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Aggiungi al Listino</span>
              </button>
            </div>
          </div>

          <div>
            <label className="text-[11px] text-zinc-400 block mb-1">Descrizione Trattamento (Opzionale)</label>
            <input
              type="text"
              value={newServiceDesc}
              onChange={(e) => setNewServiceDesc(e.target.value)}
              placeholder="Es. Cura della barba con panno caldo e rasatura rifinita a mano libera..."
              className="w-full px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs outline-none focus:border-amber-500"
            />
          </div>
        </div>
      </div>

      {/* 5. PAGAMENTI IN APP (STRIPE) & IN SALONE */}
      <div className="glass-panel rounded-3xl p-6 border border-amber-500/20 space-y-4">
        <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
          <CreditCard className="w-4 h-4" />
          <span>Prezzo Servizio & Modalità di Pagamento</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="text-zinc-300 font-semibold block mb-1">Prezzo Base Taglio (€)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.5"
                min="5"
                value={settings.slot_price_cents / 100}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    slot_price_cents: Math.round(parseFloat(e.target.value || "0") * 100),
                  })
                }
                className="w-28 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-amber-400 font-black text-base outline-none focus:border-amber-500 text-center"
              />
              <span className="text-zinc-400">Euro</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-zinc-300 font-semibold block">Modalità Abilitate per i Clienti</label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.allow_in_person_payment}
                  onChange={(e) =>
                    setSettings({ ...settings, allow_in_person_payment: e.target.checked })
                  }
                  className="rounded bg-zinc-900 border-zinc-700 text-amber-500 focus:ring-amber-500"
                />
                <span>Paga in Salone (Contanti / POS)</span>
              </label>

              <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.allow_in_app_payment}
                  onChange={(e) =>
                    setSettings({ ...settings, allow_in_app_payment: e.target.checked })
                  }
                  className="rounded bg-zinc-900 border-zinc-700 text-amber-500 focus:ring-amber-500"
                />
                <span>Paga Subito in App</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* 6. RECAPITI SALONE (CHIAMA & WHATSAPP) */}
      <div className="glass-panel rounded-3xl p-6 border border-amber-500/20 space-y-4">
        <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
          <Phone className="w-4 h-4" />
          <span>Recapiti del Negozio (Chiama & WhatsApp per i Clienti)</span>
        </div>
        <p className="text-xs text-zinc-400">
          I numeri inseriti qui sotto vengono collegati direttamente ai pulsanti &quot;Chiama Salone&quot; e &quot;WhatsApp&quot; nella chat del cliente.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="text-zinc-300 font-semibold block mb-1">
              Numero di Telefono del Negozio (Chiamata)
            </label>
            <input
              type="tel"
              value={settings.salon_phone || ""}
              onChange={(e) =>
                setSettings({ ...settings, salon_phone: e.target.value })
              }
              placeholder="Es. 02 1234567 oppure 340 1234567"
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-100 font-medium outline-none focus:border-amber-500"
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              Avvia la telefonata diretta dal cellulare del cliente.
            </p>
          </div>

          <div>
            <label className="text-zinc-300 font-semibold block mb-1">
              Numero WhatsApp del Salone (Messaggi)
            </label>
            <input
              type="tel"
              value={settings.whatsapp_phone || ""}
              onChange={(e) =>
                setSettings({ ...settings, whatsapp_phone: e.target.value })
              }
              placeholder="Es. 347 1234567"
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-100 font-medium outline-none focus:border-amber-500"
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              Apre la chat WhatsApp verso il numero configurato del negozio.
            </p>
          </div>
        </div>
      </div>

      {/* 7. AGENDA GIORNALIERA VIA WHATSAPP (PER IL TITOLARE) */}
      <div className="glass-panel rounded-3xl p-6 border border-amber-500/20 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
            <MessageCircle className="w-4 h-4 text-emerald-400" />
            <span>Riepilogo Giornaliero / Agenda di Domani su WhatsApp</span>
          </div>

          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings.enable_barber_daily_agenda_whatsapp ?? false}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  enable_barber_daily_agenda_whatsapp: e.target.checked,
                })
              }
              className="rounded bg-zinc-900 border-zinc-700 text-amber-500 focus:ring-amber-500 w-4 h-4"
            />
            <span className="text-xs font-bold text-zinc-200">
              {settings.enable_barber_daily_agenda_whatsapp ? "Funzione Attiva" : "Funzione Disattivata"}
            </span>
          </label>
        </div>

        <p className="text-xs text-zinc-400 leading-relaxed">
          Se abilitato, nel calendario admin compare il pulsante rapido <strong className="text-amber-400">&quot;📱 Invia Agenda su WhatsApp&quot;</strong> che compone e invia sul tuo WhatsApp personale l&apos;intera scaletta della giornata selezionata (orari, nomi clienti, trattamenti, note e preferenze riservate).
        </p>

        {settings.enable_barber_daily_agenda_whatsapp && (
          <div className="pt-2 border-t border-zinc-800/80">
            <label className="text-zinc-300 font-semibold text-xs block mb-1">
              Numero WhatsApp del Titolare / Barbiere (dove ricevere l&apos;agenda)
            </label>
            <input
              type="tel"
              value={settings.barber_agenda_whatsapp_phone || ""}
              onChange={(e) =>
                setSettings({ ...settings, barber_agenda_whatsapp_phone: e.target.value })
              }
              placeholder={settings.whatsapp_phone ? `Predefinito: ${settings.whatsapp_phone}` : "Es. 347 1234567"}
              className="w-full sm:w-80 px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-100 font-medium text-xs outline-none focus:border-amber-500"
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              Se lasciato vuoto, l&apos;agenda verrà inviata al numero WhatsApp principale del salone ({settings.whatsapp_phone || "non ancora impostato"}).
            </p>
          </div>
        )}
      </div>

      {/* 8. NOTIFICHE ACUSTICHE IN SALONE (CHIME NUOVE PRENOTAZIONI) */}
      <div className="glass-panel rounded-3xl p-6 border border-amber-500/20 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
            <Volume2 className="w-4 h-4 text-amber-400" />
            <span>Notifiche Acustiche in Salone (Chime Nuove Prenotazioni)</span>
          </div>

          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings.enable_new_booking_sound ?? true}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  enable_new_booking_sound: e.target.checked,
                })
              }
              className="rounded bg-zinc-900 border-zinc-700 text-amber-500 focus:ring-amber-500 w-4 h-4"
            />
            <span className="text-xs font-bold text-zinc-200">
              {(settings.enable_new_booking_sound ?? true) ? "Suono Attivo" : "Silenzioso"}
            </span>
          </label>
        </div>

        <p className="text-xs text-zinc-400 leading-relaxed">
          Quando ricevi una nuova prenotazione da un cliente (online o tramite l&apos;assistente AI) mentre hai il pannello aperto su tablet o PC al banco, l&apos;applicazione riproduce un tocco sonoro discreto ed elegante (&quot;campana concierge&quot;) per avvisarti senza disturbare il salone.
        </p>

        <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between gap-3">
          <span className="text-[11px] text-zinc-400">
            Ascolta un&apos;anteprima del suono sintetizzato:
          </span>
          <button
            type="button"
            onClick={() => playLuxuryBookingChime()}
            className="px-3.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-amber-500/30 text-amber-300 font-bold text-xs flex items-center gap-1.5 transition shadow-sm"
          >
            <Bell className="w-3.5 h-3.5 text-amber-400" />
            <span>🔊 Prova il Tocco Sonoro</span>
          </button>
        </div>
      </div>

      {/* Pulsante Salvataggio */}
      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={isSaving}
          className="px-6 py-3 rounded-2xl font-bold bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/25 flex items-center gap-2 transition disabled:opacity-50 text-xs uppercase tracking-wider"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>Salva Configurazioni</span>
        </button>
      </div>
    </form>
  );
}

