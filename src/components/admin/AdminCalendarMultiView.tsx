"use client";

import { useState, useEffect, useMemo } from "react";
import { format, addMonths, subMonths, getDaysInMonth, startOfMonth, getDay } from "date-fns";
import { it } from "date-fns/locale";
import type { Appointment, BusinessSettings } from "@/types/database";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  Plus,
  Image as ImageIcon,
  Sparkles,
  User,
  CheckCircle2,
  XCircle,
  X,
  ChevronDown,
  ChevronUp,
  Phone,
  MessageCircle,
  Ban,
  Smartphone,
  Copy,
  Check,
  ExternalLink,
  Unlock,
  Loader2,
  Scissors,
  Lock,
  Edit2,
  Award,
  Search,
  ArrowRight,
} from "lucide-react";
import {
  completeAppointment,
  cancelAppointmentByAdmin,
  quickBlockSlot,
  quickUnblockSlot,
  quickManualBooking,
  getAllClientInternalNotes,
  updateClientInternalNotes,
  fetchClientBadgesMap,
  type ClientBadgeInfo,
} from "@/app/actions/admin";
import { normalizePhoneDigits } from "@/lib/phone";
import { buildReminderWhatsAppUrl, buildBarberDailyAgendaWhatsAppUrl, type DailyAgendaItem } from "@/lib/whatsapp";

interface AdminCalendarMultiViewProps {
  initialAppointments: Appointment[];
  settings: BusinessSettings;
  onOpenWalkin: (date: string, time: string) => void;
  onRefresh?: () => void;
}

type ViewMode = "day" | "month" | "year";

export function AdminCalendarMultiView({
  initialAppointments,
  settings,
  onOpenWalkin,
  onRefresh,
}: AdminCalendarMultiViewProps) {
  const [appointments, setAppointments] = useState<Appointment[]>(initialAppointments);
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDayString, setSelectedDayString] = useState<string>(
    format(new Date(), "yyyy-MM-dd")
  );
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [expandedAptId, setExpandedAptId] = useState<string | null>(null);

  // Stato sincronizzazione calendario smartphone (iCal)
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [copiedSyncUrl, setCopiedSyncUrl] = useState(false);

  // Stato modal prenotazione manuale rapida
  const [manualBookingModal, setManualBookingModal] = useState<{
    isOpen: boolean;
    date: string;
    time: string;
  }>({ isOpen: false, date: "", time: "" });
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [manualServiceId, setManualServiceId] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  // Stato Promemoria WhatsApp inviati e Modal Promemoria del Giorno
  const [remindersSent, setRemindersSent] = useState<Record<string, boolean>>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("smart_barber_reminders_sent");
        return stored ? JSON.parse(stored) : {};
      } catch {}
    }
    return {};
  });
  const [isReminderBatchModalOpen, setIsReminderBatchModalOpen] = useState(false);

  const markReminderSent = (aptId: string) => {
    setRemindersSent((prev) => {
      const updated = { ...prev, [aptId]: true };
      try {
        localStorage.setItem("smart_barber_reminders_sent", JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  // Barra di ricerca rapida clienti / appuntamenti futuri
  const [searchQuery, setSearchQuery] = useState("");

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    const digits = q.replace(/\D/g, "");

    return appointments
      .filter((apt) => {
        if (apt.customer_phone === "BLOCCATO" || apt.customer_name?.startsWith("⛔")) {
          return false;
        }
        const nameMatch = apt.customer_name?.toLowerCase().includes(q);
        const phoneMatch = digits.length >= 2 && apt.customer_phone?.replace(/\D/g, "").includes(digits);
        return nameMatch || phoneMatch;
      })
      .sort((a, b) => {
        const dateA = `${a.appointment_date}T${a.start_time}`;
        const dateB = `${b.appointment_date}T${b.start_time}`;
        return dateB.localeCompare(dateA);
      })
      .slice(0, 8);
  }, [appointments, searchQuery]);

  const handleJumpToAppointment = (dateStr: string, aptId: string) => {
    setViewMode("day");
    setSelectedDayString(dateStr);
    setCurrentDate(new Date(`${dateStr}T00:00:00`));
    setExpandedAptId(aptId);
    setSearchQuery("");
  };

  // Note Riservate Barbiere (Indicizzate per telefono cliente)
  const [clientNotes, setClientNotes] = useState<Record<string, string>>({});
  const [editingNoteAptId, setEditingNoteAptId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);

  // Badge Fedeltà & Storico Clienti (Nuovo vs Abituale vs VIP)
  const [clientBadges, setClientBadges] = useState<Record<string, ClientBadgeInfo>>({});

  useEffect(() => {
    getAllClientInternalNotes()
      .then(setClientNotes)
      .catch(console.error);

    fetchClientBadgesMap()
      .then(setClientBadges)
      .catch(console.error);
  }, []);

  const renderClientBadge = (phone?: string | null, size: "sm" | "md" = "sm") => {
    if (!phone || phone === "BLOCCATO") return null;
    const digits = normalizePhoneDigits(phone);
    const info = clientBadges[digits];

    // Se non ha nessun taglio completato registrato, è Nuovo Cliente
    const isNew = !info || info.isNewCustomer;
    const isVip = info?.isVipLoyal;
    const isReturning = info?.isReturning;
    const cuts = info?.completedCuts || 0;

    if (isNew) {
      return (
        <span
          className={`inline-flex items-center gap-1 rounded-md font-bold transition shrink-0 ${
            size === "md"
              ? "text-xs px-2.5 py-1 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
              : "text-[10px] px-2 py-0.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
          }`}
          title="Primo appuntamento in salone per questo cliente"
        >
          <Sparkles className={size === "md" ? "w-3 h-3 text-emerald-400" : "w-2.5 h-2.5 text-emerald-400"} />
          <span>Nuovo Cliente</span>
        </span>
      );
    }

    if (isVip) {
      return (
        <span
          className={`inline-flex items-center gap-1 rounded-md font-bold shadow-sm transition shrink-0 ${
            size === "md"
              ? "text-xs px-2.5 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/40"
              : "text-[10px] px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40"
          }`}
          title={`Cliente Fedele VIP: ${cuts} tagli completati`}
        >
          <Award className={size === "md" ? "w-3 h-3 text-amber-400" : "w-2.5 h-2.5 text-amber-400"} />
          <span>Fedele ({cuts} tagli)</span>
        </span>
      );
    }

    if (isReturning) {
      return (
        <span
          className={`inline-flex items-center gap-1 rounded-md font-bold transition shrink-0 ${
            size === "md"
              ? "text-xs px-2.5 py-1 bg-sky-500/15 text-sky-300 border border-sky-500/30"
              : "text-[10px] px-2 py-0.5 bg-sky-500/15 text-sky-300 border border-sky-500/30"
          }`}
          title={`Cliente Abituale: ${cuts} ${cuts === 1 ? "taglio completato" : "tagli completati"}`}
        >
          <Scissors className={size === "md" ? "w-3 h-3 text-sky-400" : "w-2.5 h-2.5 text-sky-400"} />
          <span>Abituale ({cuts})</span>
        </span>
      );
    }

    return null;
  };

  const handleSaveAppointmentNote = async (phone: string, aptId: string) => {
    setIsSavingNote(true);
    try {
      const res = await updateClientInternalNotes(phone, noteInput);
      if (res.success) {
        const digits = phone.replace(/\D/g, "");
        setClientNotes((prev) => ({ ...prev, [digits]: res.notes }));
        setEditingNoteAptId(null);
      }
    } catch (e) {
      console.error("Errore salvataggio nota cliente:", e);
    } finally {
      setIsSavingNote(false);
    }
  };

  const appointmentsByDate = appointments.reduce((acc, apt) => {
    if (apt.status === "cancelled") return acc;
    acc[apt.appointment_date] = acc[apt.appointment_date] || [];
    acc[apt.appointment_date].push(apt);
    return acc;
  }, {} as Record<string, Appointment[]>);

  const handleComplete = async (aptId: string) => {
    setActionLoadingId(aptId);
    try {
      const res = await completeAppointment(aptId);
      if (res.success) {
        setAppointments((prev) =>
          prev.map((a) => (a.id === aptId ? { ...a, status: "completed", payment_status: "paid" } : a))
        );

        // Aggiorna lo stato dei badge cliente in tempo reale
        const completedApt = appointments.find((a) => a.id === aptId);
        if (completedApt?.customer_phone) {
          const digits = normalizePhoneDigits(completedApt.customer_phone);
          if (digits) {
            setClientBadges((prev) => {
              const existing = prev[digits] || {
                phoneDigits: digits,
                fullName: completedApt.customer_name,
                completedCuts: 0,
                totalBookings: 1,
                fidelityPoints: 0,
                noShowCount: 0,
                isNewCustomer: true,
                isReturning: false,
                isVipLoyal: false,
              };
              const newCuts = existing.completedCuts + 1;
              const newPoints = existing.fidelityPoints + (res.pointsAwarded ?? 1);
              return {
                ...prev,
                [digits]: {
                  ...existing,
                  completedCuts: newCuts,
                  fidelityPoints: newPoints,
                  isNewCustomer: newCuts === 0,
                  isReturning: newCuts >= 1 && newCuts < 5,
                  isVipLoyal: newCuts >= 5,
                },
              };
            });
          }
        }

        onRefresh?.();
      }
    } catch (e) {
      console.error("Errore completamento appuntamento:", e);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCancel = async (aptId: string) => {
    if (!confirm("Sei sicuro di voler annullare questo appuntamento? Lo slot tornerà libero.")) return;
    setActionLoadingId(aptId);
    try {
      const res = await cancelAppointmentByAdmin(aptId);
      if (res.success) {
        setAppointments((prev) =>
          prev.map((a) => (a.id === aptId ? { ...a, status: "cancelled" } : a))
        );
        onRefresh?.();
      }
    } catch (e) {
      console.error("Errore annullamento appuntamento:", e);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleQuickBlock = async (dateStr: string, timeStr: string) => {
    setActionLoadingId(`block-${timeStr}`);
    try {
      const res = await quickBlockSlot({
        date: dateStr,
        time: timeStr,
        durationMinutes: settings.slot_duration_minutes || 30,
        reason: "Pausa / Impegno Personale",
      });
      if (res.success && res.appointmentId) {
        const newApt: Appointment = {
          id: res.appointmentId,
          user_id: "admin-block",
          customer_name: "⛔ Blocco Barbiere / Pausa",
          customer_phone: "BLOCCATO",
          appointment_date: dateStr,
          start_time: `${timeStr}:00`,
          end_time: `${timeStr}:30:00`,
          duration_minutes: settings.slot_duration_minutes || 30,
          status: "confirmed",
          payment_status: "paid",
          payment_method: "in_person",
          price_cents: 0,
          notes: "Orario bloccato dal barbiere (pausa o impegno personale)",
          lookbook_image_url: null,
          points_awarded: 0,
          stripe_payment_intent_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setAppointments((prev) => [...prev, newApt]);
        onRefresh?.();
      } else if (!res.success) {
        alert(res.error || "Impossibile bloccare lo slot");
      }
    } catch (err) {
      console.error("Errore blocco slot:", err);
      alert("Errore durante il blocco dello slot");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleQuickUnblock = async (aptId: string) => {
    setActionLoadingId(aptId);
    try {
      const res = await quickUnblockSlot(aptId);
      if (res.success) {
        setAppointments((prev) => prev.filter((a) => a.id !== aptId));
        onRefresh?.();
      } else {
        alert(res.error || "Impossibile sbloccare l'orario");
      }
    } catch (err) {
      console.error("Errore sblocco slot:", err);
      alert("Errore durante lo sblocco dello slot");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSaveManualBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName.trim()) {
      setManualError("Inserisci il nome del cliente.");
      return;
    }
    setManualLoading(true);
    setManualError(null);
    try {
      const srv =
        (settings.services || []).find((s) => s.id === manualServiceId) ||
        settings.services?.[0];

      const res = await quickManualBooking({
        date: manualBookingModal.date,
        time: manualBookingModal.time,
        customerName: manualName.trim(),
        customerPhone: manualPhone.trim() || undefined,
        serviceName: srv?.name || "Taglio Capelli",
        priceCents: srv?.price_cents || settings.slot_price_cents || 1800,
        durationMinutes: srv?.duration_minutes || settings.slot_duration_minutes || 30,
        notes: manualNotes.trim() || undefined,
      });

      if (!res.success || !res.appointmentId) {
        setManualError(res.error || "Impossibile registrare la prenotazione.");
      } else {
        const newApt: Appointment = {
          id: res.appointmentId,
          user_id: "manual",
          customer_name: manualName.trim(),
          customer_phone: manualPhone.trim() || "Al banco / Telefono",
          appointment_date: manualBookingModal.date,
          start_time: `${manualBookingModal.time}:00`,
          end_time: `${manualBookingModal.time}:30:00`,
          duration_minutes: srv?.duration_minutes || settings.slot_duration_minutes || 30,
          status: "confirmed",
          payment_status: "unpaid",
          payment_method: "in_person",
          price_cents: srv?.price_cents || settings.slot_price_cents || 1800,
          notes: manualNotes.trim() || null,
          lookbook_image_url: null,
          points_awarded: 1,
          stripe_payment_intent_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setAppointments((prev) => [...prev, newApt]);
        setManualBookingModal({ isOpen: false, date: "", time: "" });
        setManualName("");
        setManualPhone("");
        setManualNotes("");
        onRefresh?.();
      }
    } catch {
      setManualError("Errore durante il salvataggio.");
    } finally {
      setManualLoading(false);
    }
  };

  // Navigazione avanti/indietro
  const handlePrev = () => {
    if (viewMode === "day") {
      const prev = new Date(currentDate);
      prev.setDate(prev.getDate() - 1);
      setCurrentDate(prev);
      setSelectedDayString(format(prev, "yyyy-MM-dd"));
    } else if (viewMode === "month") {
      setCurrentDate(subMonths(currentDate, 1));
    } else {
      const prevYear = new Date(currentDate);
      prevYear.setFullYear(prevYear.getFullYear() - 1);
      setCurrentDate(prevYear);
    }
  };

  const handleNext = () => {
    if (viewMode === "day") {
      const next = new Date(currentDate);
      next.setDate(next.getDate() + 1);
      setCurrentDate(next);
      setSelectedDayString(format(next, "yyyy-MM-dd"));
    } else if (viewMode === "month") {
      setCurrentDate(addMonths(currentDate, 1));
    } else {
      const nextYear = new Date(currentDate);
      nextYear.setFullYear(nextYear.getFullYear() + 1);
      setCurrentDate(nextYear);
    }
  };

  return (
    <div className="glass-panel rounded-3xl p-5 sm:p-6 space-y-6 border border-amber-500/20 shadow-2xl">
      {/* Header con Selettore Viste e Navigazione */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <span className="text-xs uppercase tracking-wider font-bold text-amber-400">
            Visione Globale Agenda
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-zinc-100 capitalize">
            {viewMode === "day" && format(currentDate, "EEEE d MMMM yyyy", { locale: it })}
            {viewMode === "month" && format(currentDate, "MMMM yyyy", { locale: it })}
            {viewMode === "year" && format(currentDate, "yyyy", { locale: it })}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {/* Frecce Navigazione */}
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-1">
            <button
              onClick={handlePrev}
              type="button"
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                const now = new Date();
                setCurrentDate(now);
                setSelectedDayString(format(now, "yyyy-MM-dd"));
              }}
              type="button"
              className="px-2 py-1 text-xs font-semibold text-zinc-300 hover:text-amber-400 transition"
            >
              Oggi
            </button>
            <button
              onClick={handleNext}
              type="button"
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Switcher Anno / Mese / Giorno */}
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-1 text-xs font-semibold">
            <button
              onClick={() => setViewMode("day")}
              className={`px-3 py-1.5 rounded-lg transition ${
                viewMode === "day"
                  ? "bg-amber-500 text-black font-bold shadow-md shadow-amber-500/20"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Giorno & Ora
            </button>
            <button
              onClick={() => setViewMode("month")}
              className={`px-3 py-1.5 rounded-lg transition ${
                viewMode === "month"
                  ? "bg-amber-500 text-black font-bold shadow-md shadow-amber-500/20"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Mese
            </button>
            <button
              onClick={() => setViewMode("year")}
              className={`px-3 py-1.5 rounded-lg transition ${
                viewMode === "year"
                  ? "bg-amber-500 text-black font-bold shadow-md shadow-amber-500/20"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Anno
            </button>
          </div>

          {/* Sincronizzazione Smartphone (Google Calendar / iPhone iCal) */}
          <button
            type="button"
            onClick={() => setIsSyncModalOpen(true)}
            className="px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-amber-500/30 text-amber-300 hover:text-amber-200 text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
            title="Sincronizza gli appuntamenti con Google Calendar e Apple Calendar sul tuo smartphone"
          >
            <Smartphone className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Sincronizza Smartphone</span>
            <span className="sm:hidden">Sync</span>
          </button>
        </div>
      </div>

      {/* Barra di Ricerca Veloce Clienti & Appuntamenti Futuri */}
      <div className="relative">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cerca cliente per nome o cellulare (es. Marco o 347)..."
            className="w-full pl-10 pr-10 py-2.5 rounded-2xl bg-zinc-900/90 border border-zinc-800 text-zinc-100 placeholder:text-zinc-500 text-xs outline-none focus:border-amber-500 transition shadow-inner"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 p-1 rounded-lg text-zinc-400 hover:text-zinc-200 transition"
              title="Cancella ricerca"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Dropdown Risultati Ricerca Immediata */}
        {searchQuery.trim().length >= 2 && (
          <div className="absolute top-full left-0 right-0 mt-2 z-40 bg-zinc-950 border border-amber-500/40 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="p-2.5 border-b border-zinc-800/80 bg-zinc-900/50 flex items-center justify-between text-[11px] text-zinc-400">
              <span className="font-bold text-amber-400 flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5" />
                Risultati trovati in agenda ({searchResults.length})
              </span>
              <span>Tocca un appuntamento per aprirlo nel calendario</span>
            </div>

            <div className="max-h-72 overflow-y-auto divide-y divide-zinc-900">
              {searchResults.length === 0 ? (
                <div className="p-4 text-center text-xs text-zinc-500 italic">
                  Nessun appuntamento trovato per &quot;{searchQuery}&quot;.
                </div>
              ) : (
                searchResults.map((apt) => {
                  let formattedDate = apt.appointment_date;
                  try {
                    formattedDate = format(
                      new Date(`${apt.appointment_date}T00:00:00`),
                      "EEEE d MMMM yyyy",
                      { locale: it }
                    );
                  } catch {}

                  const isToday = apt.appointment_date === format(new Date(), "yyyy-MM-dd");

                  return (
                    <div
                      key={apt.id}
                      onClick={() => handleJumpToAppointment(apt.appointment_date, apt.id)}
                      className="p-3 hover:bg-zinc-900/80 transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 group"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-zinc-100 text-xs group-hover:text-amber-400 transition">
                            {apt.customer_name}
                          </span>
                          <span className="text-[11px] text-zinc-400 font-medium">
                            {apt.customer_phone}
                          </span>
                          {renderClientBadge(apt.customer_phone)}
                          {isToday && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/40 font-bold uppercase tracking-wider">
                              Oggi
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                          <span className="capitalize font-medium text-zinc-300">
                            {formattedDate}
                          </span>
                          <span>•</span>
                          <span className="font-bold text-amber-400">
                            Ore {apt.start_time.substring(0, 5)}
                          </span>
                          <span className="text-zinc-500">({apt.duration_minutes} min)</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                        <span className="text-xs font-bold text-amber-400 group-hover:translate-x-0.5 transition flex items-center gap-1 bg-zinc-900 group-hover:bg-amber-500 group-hover:text-black px-2.5 py-1 rounded-xl border border-zinc-700">
                          <span>Vai al giorno</span>
                          <ArrowRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* 1. VISTA GIORNO & ORA (Timeline dinamica con durata slot) */}
      {/* ========================================================= */}
      {viewMode === "day" && (() => {
        const dayAppointments = appointmentsByDate[selectedDayString] || [];
        const eligibleReminders = dayAppointments.filter(
          (a) =>
            a.status === "confirmed" &&
            a.customer_phone &&
            a.customer_phone !== "BLOCCATO" &&
            !a.customer_name?.startsWith("⛔")
        );

        // Costruzione URL agenda giornaliera via WhatsApp per il barbiere
        const targetBarberPhone = settings.barber_agenda_whatsapp_phone || settings.whatsapp_phone || "";
        const agendaItems: DailyAgendaItem[] = [...dayAppointments]
          .sort((a, b) => a.start_time.localeCompare(b.start_time))
          .map((apt) => {
            const isBlocked =
              apt.customer_phone === "BLOCCATO" ||
              apt.customer_name?.startsWith("⛔");
            const clean = normalizePhoneDigits(apt.customer_phone);
            const badge = clientBadges[clean];
            return {
              timeStr: apt.start_time.substring(0, 5),
              customerName: apt.customer_name,
              customerPhone: apt.customer_phone,
              durationMinutes: apt.duration_minutes,
              isBlocked,
              notes: apt.notes,
              internalNote: clean ? clientNotes[clean] : undefined,
              isNewCustomer: badge?.isNewCustomer ?? true,
              isVipLoyal: badge?.isVipLoyal ?? false,
              completedCuts: badge?.completedCuts ?? 0,
            };
          });

        const barberAgendaUrl = buildBarberDailyAgendaWhatsAppUrl({
          barberPhone: targetBarberPhone,
          dateStr: format(new Date(`${selectedDayString}T00:00:00`), "EEEE d MMMM", { locale: it }),
          items: agendaItems,
        });

        return (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-zinc-400 bg-zinc-900/60 p-3 rounded-xl border border-zinc-800">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                Timeline oraria (Slot da {settings.slot_duration_minutes} min)
              </span>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-zinc-400">
                  Totale appuntamenti:{" "}
                  <strong className="text-amber-400 font-bold">
                    {dayAppointments.length}
                  </strong>
                </span>
                {eligibleReminders.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsReminderBatchModalOpen(true)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 hover:text-emerald-200 font-bold flex items-center gap-1.5 transition text-xs shadow-sm"
                    title="Invia i promemoria WhatsApp precompilati ai clienti di questa giornata"
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Promemoria WhatsApp ({eligibleReminders.length})</span>
                  </button>
                )}

                {settings.enable_barber_daily_agenda_whatsapp && (
                  <a
                    href={barberAgendaUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold flex items-center gap-1.5 transition text-xs shadow-sm shadow-amber-500/20"
                    title="Invia la scaletta completa di questa giornata sul tuo WhatsApp personale"
                  >
                    <Smartphone className="w-3.5 h-3.5 text-black" />
                    <span>Invia Agenda WhatsApp</span>
                  </a>
                )}
              </div>
            </div>

            <div className="space-y-2">
            {(() => {
              // Genera la lista degli orari da opening_time a closing_time
              const slots = [];
              const [openH, openM] = (settings.opening_time || "09:00:00").split(":").map(Number);
              const [closeH, closeM] = (settings.closing_time || "19:30:00").split(":").map(Number);
              const totalOpenMinutes = openH * 60 + openM;
              const totalCloseMinutes = closeH * 60 + closeM;

              const dayAppointments = appointmentsByDate[selectedDayString] || [];

              for (
                let m = totalOpenMinutes;
                m < totalCloseMinutes;
                m += settings.slot_duration_minutes
              ) {
                const hour = Math.floor(m / 60);
                const min = m % 60;
                const timeString = `${hour < 10 ? "0" + hour : hour}:${min < 10 ? "0" + min : min}`;

                // Cerca se esiste appuntamento a quest'ora
                const apt = dayAppointments.find(
                  (a) => a.start_time.substring(0, 5) === timeString
                );

                slots.push({ timeString, apt });
              }

              return slots.map(({ timeString, apt }) => {
                if (apt) {
                  const isBlocked =
                    apt.customer_phone === "BLOCCATO" ||
                    apt.customer_name?.startsWith("⛔");

                  if (isBlocked) {
                    return (
                      <div
                        key={timeString}
                        className="rounded-2xl border border-red-500/30 bg-red-950/25 border-l-4 border-l-red-500 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-red-400 text-sm w-12 text-center">
                            {timeString}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="p-1 rounded-lg bg-red-500/20 text-red-300">
                              <Ban className="w-4 h-4" />
                            </span>
                            <div>
                              <span className="font-bold text-red-200 text-sm block">
                                {apt.customer_name}
                              </span>
                              <span className="text-[11px] text-zinc-400 italic">
                                Orario bloccato dal barbiere (non prenotabile dai clienti né dall&apos;AI)
                              </span>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={actionLoadingId === apt.id}
                          onClick={() => handleQuickUnblock(apt.id)}
                          className="px-3.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-emerald-500 hover:text-black border border-zinc-700 text-zinc-300 text-xs font-bold flex items-center gap-1.5 transition self-end sm:self-auto shadow-sm"
                          title="Riapri questo orario per le prenotazioni dei clienti"
                        >
                          {actionLoadingId === apt.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                          )}
                          <span>Sblocca Orario</span>
                        </button>
                      </div>
                    );
                  }

                  const isCompleted = apt.status === "completed";
                  const isCancelled = apt.status === "cancelled";
                  const isExpanded = expandedAptId === apt.id;
                  const cleanPhone = (apt.customer_phone || "").replace(/\D/g, "");
                  const customerInternalNote = cleanPhone ? clientNotes[cleanPhone] : null;

                  return (
                    <div
                      key={timeString}
                      className={`rounded-2xl border shadow-sm transition-all duration-200 overflow-hidden ${
                        isCompleted
                          ? "bg-zinc-950/80 border-emerald-500/30 border-l-4 border-l-emerald-500"
                          : isCancelled
                          ? "bg-zinc-950/40 border-zinc-800 opacity-60"
                          : isExpanded
                          ? "bg-zinc-900 border-amber-500/50 border-l-4 border-l-amber-500 shadow-lg shadow-amber-500/5"
                          : "bg-zinc-900/90 border-zinc-800 border-l-4 border-l-amber-500 hover:border-zinc-700"
                      }`}
                    >
                      {/* Riga principale cliccabile */}
                      <div
                        onClick={() => setExpandedAptId(isExpanded ? null : apt.id)}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 gap-3 cursor-pointer select-none"
                      >
                        <div className="flex items-start sm:items-center gap-3">
                          <span className="font-bold text-amber-400 text-sm w-12 text-center pt-0.5 sm:pt-0">
                            {timeString}
                          </span>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-zinc-100 text-sm">
                                {apt.customer_name}
                              </span>
                              <span className="text-xs text-amber-400 font-semibold">
                                {apt.customer_phone}
                              </span>
                              {renderClientBadge(apt.customer_phone)}
                              {customerInternalNote && (
                                <span
                                  className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold"
                                  title={`Nota Riservata: ${customerInternalNote}`}
                                >
                                  <Lock className="w-2.5 h-2.5 text-amber-400" />
                                  <span>Nota Riservata</span>
                                </span>
                              )}
                              {apt.lookbook_image_url && (
                                <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold">
                                  <ImageIcon className="w-3 h-3" />
                                  Foto allegata
                                </span>
                              )}
                            </div>
                            {apt.notes && !isExpanded && (
                              <p className="text-xs text-zinc-400 mt-0.5 line-clamp-1">
                                Note: {apt.notes}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
                          {cleanPhone && !isBlocked && !isCancelled && !isCompleted && (
                            <a
                              href={buildReminderWhatsAppUrl({
                                customerName: apt.customer_name,
                                customerPhone: apt.customer_phone,
                                dateStr: format(new Date(`${apt.appointment_date}T00:00:00`), "EEEE d MMMM", { locale: it }),
                                timeStr: apt.start_time.substring(0, 5),
                              })}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => {
                                e.stopPropagation();
                                markReminderSent(apt.id);
                              }}
                              title="Invia promemoria WhatsApp al cliente"
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
                                remindersSent[apt.id]
                                  ? "bg-zinc-800 text-emerald-400 border-emerald-500/40"
                                  : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                              }`}
                            >
                              <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="hidden sm:inline">
                                {remindersSent[apt.id] ? "Promemoria Inviato ✓" : "Promemoria WhatsApp"}
                              </span>
                              <span className="sm:hidden">
                                {remindersSent[apt.id] ? "✓ WA" : "WA"}
                              </span>
                            </a>
                          )}
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                              apt.payment_status === "paid"
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                : "bg-zinc-800 text-zinc-400 border-zinc-700"
                            }`}
                          >
                            {apt.payment_status === "paid" ? "Pagato In App" : "Paga in Salone"}
                          </span>
                          <span className="text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                            {apt.duration_minutes} min
                          </span>
                          <span className="p-1 rounded-md text-zinc-400 hover:text-zinc-200">
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-amber-400" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </span>
                        </div>
                      </div>

                      {/* DETTAGLIO ESPANSO (ACCORDION) */}
                      {isExpanded && (
                        <div className="p-4 bg-zinc-950/70 border-t border-zinc-800/80 space-y-4 animate-in fade-in duration-150">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Recap Cliente & Contatti */}
                            <div className="space-y-2 text-xs">
                              <h5 className="font-bold text-amber-400 text-xs flex items-center gap-1.5">
                                <User className="w-3.5 h-3.5" />
                                Informazioni Cliente
                              </h5>
                              <p className="text-zinc-200">
                                Nome: <strong className="text-white">{apt.customer_name}</strong>
                              </p>

                              {/* Scheda Riconoscimento Storico & Fedeltà Cliente */}
                              {(() => {
                                const badge = clientBadges[cleanPhone];
                                const cuts = badge?.completedCuts || 0;
                                const points = badge?.fidelityPoints || 0;
                                const isNew = !badge || badge.isNewCustomer;
                                const noShows = badge?.noShowCount || 0;

                                return (
                                  <div className="p-3 rounded-2xl bg-zinc-950/80 border border-zinc-800 space-y-2 mt-1">
                                    <div className="flex items-center justify-between">
                                      <span className="font-bold text-zinc-300 text-xs flex items-center gap-1.5">
                                        <Award className="w-3.5 h-3.5 text-amber-400" />
                                        <span>Fidelizzazione & Storico Salone</span>
                                      </span>
                                      {renderClientBadge(apt.customer_phone, "md")}
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                                      <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800/80">
                                        <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider">
                                          Tagli Completati
                                        </span>
                                        <span className="text-zinc-200 font-bold text-sm">
                                          {cuts === 0 ? "1° Taglio (Nuovo)" : `${cuts} eseguiti`}
                                        </span>
                                      </div>

                                      <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800/80">
                                        <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider">
                                          Punti Fedeltà
                                        </span>
                                        <span className="text-amber-400 font-bold text-sm flex items-center gap-1">
                                          <span>{points}</span>
                                          <span className="text-zinc-500 text-xs font-normal">/ {settings.fidelity_target_points || 10} pt</span>
                                        </span>
                                      </div>
                                    </div>

                                    {isNew && (
                                      <p className="text-[11px] text-emerald-400/90 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5 rounded-xl flex items-center gap-1.5">
                                        <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                        <span>Primo appuntamento: accogli il cliente con una breve consulenza iniziale!</span>
                                      </p>
                                    )}

                                    {noShows > 0 && (
                                      <p className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1.5 rounded-xl">
                                        ⚠️ Attenzione: il cliente ha {noShows} {noShows === 1 ? "mancata presentazione registrata" : "mancate presentazioni registrate"}.
                                      </p>
                                    )}
                                  </div>
                                );
                              })()}
                              <div className="flex flex-wrap items-center gap-2 pt-1">
                                <a
                                  href={`tel:${cleanPhone}`}
                                  className="px-2.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition"
                                >
                                  <Phone className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>Chiama ({apt.customer_phone})</span>
                                </a>
                                {cleanPhone && !isCancelled && !isCompleted && (
                                  <a
                                    href={buildReminderWhatsAppUrl({
                                      customerName: apt.customer_name,
                                      customerPhone: apt.customer_phone,
                                      dateStr: format(new Date(`${apt.appointment_date}T00:00:00`), "EEEE d MMMM", { locale: it }),
                                      timeStr: apt.start_time.substring(0, 5),
                                    })}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={() => markReminderSent(apt.id)}
                                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition shadow-sm ${
                                      remindersSent[apt.id]
                                        ? "bg-zinc-800 text-emerald-400 border-emerald-500/40"
                                        : "bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/40 text-emerald-300"
                                    }`}
                                  >
                                    <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                                    <span>
                                      {remindersSent[apt.id]
                                        ? "✓ Promemoria Inviato (Reinvia)"
                                        : "Invia Promemoria 24h WhatsApp"}
                                    </span>
                                  </a>
                                )}
                              </div>
                              {apt.notes && (
                                <div className="mt-2 p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs">
                                  <span className="font-bold text-zinc-400 block mb-0.5">Note Cliente:</span>
                                  {apt.notes}
                                </div>
                              )}

                              {/* Note Riservate Barbiere (Invisibili al cliente) */}
                              <div className="mt-2.5 p-3 rounded-2xl bg-zinc-900 border border-amber-500/30 text-zinc-300 text-xs space-y-1.5">
                                <div className="flex items-center justify-between text-zinc-400">
                                  <span className="font-bold text-amber-400 flex items-center gap-1.5 text-[11px]">
                                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                                    <span>Note Riservate Barbiere (Invisibili al cliente)</span>
                                  </span>
                                  {editingNoteAptId !== apt.id && cleanPhone && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingNoteAptId(apt.id);
                                        setNoteInput(customerInternalNote || "");
                                      }}
                                      className="text-[10px] text-zinc-400 hover:text-amber-300 flex items-center gap-1 transition"
                                    >
                                      <Edit2 className="w-2.5 h-2.5" />
                                      <span>{customerInternalNote ? "Modifica" : "+ Aggiungi nota"}</span>
                                    </button>
                                  )}
                                </div>

                                {editingNoteAptId === apt.id ? (
                                  <div className="space-y-2 pt-1 animate-in fade-in">
                                    <textarea
                                      value={noteInput}
                                      onChange={(e) => setNoteInput(e.target.value)}
                                      placeholder="Es. Sfumatura a 0.5 a macchinetta, preferisce caffè macchiato caldo..."
                                      rows={2}
                                      className="w-full p-2.5 rounded-xl bg-zinc-950 border border-amber-500/50 text-zinc-100 text-xs outline-none focus:ring-1 focus:ring-amber-500 transition resize-none placeholder:text-zinc-600"
                                      autoFocus
                                    />
                                    <div className="flex items-center justify-end gap-2">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingNoteAptId(null);
                                          setNoteInput("");
                                        }}
                                        className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-medium transition"
                                      >
                                        Annulla
                                      </button>
                                      <button
                                        type="button"
                                        disabled={isSavingNote}
                                        onClick={() => handleSaveAppointmentNote(apt.customer_phone, apt.id)}
                                        className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-[11px] font-bold flex items-center gap-1 transition shadow-sm"
                                      >
                                        {isSavingNote ? (
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                          <Check className="w-3 h-3" />
                                        )}
                                        <span>Salva Nota</span>
                                      </button>
                                    </div>
                                  </div>
                                ) : customerInternalNote ? (
                                  <p className="text-xs text-zinc-200 bg-zinc-950/70 p-2.5 rounded-xl border border-zinc-800/80 leading-relaxed italic">
                                    &quot;{customerInternalNote}&quot;
                                  </p>
                                ) : (
                                  <p className="text-[11px] text-zinc-500 italic">
                                    Nessuna preferenza riservata memorizzata. Clicca &quot;+ Aggiungi nota&quot; per annotare abitudini del cliente.
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Foto Lookbook allegata */}
                            <div className="space-y-2 text-xs">
                              <h5 className="font-bold text-amber-400 text-xs flex items-center gap-1.5">
                                <ImageIcon className="w-3.5 h-3.5" />
                                Foto Esempio Taglio Desiderato
                              </h5>
                              {apt.lookbook_image_url ? (
                                <div className="flex items-center gap-3">
                                  <div
                                    onClick={() => setPreviewImageUrl(apt.lookbook_image_url || null)}
                                    className="relative w-24 h-24 rounded-xl overflow-hidden border border-amber-500/40 cursor-pointer group bg-black shrink-0"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={apt.lookbook_image_url}
                                      alt="Lookbook"
                                      className="object-cover w-full h-full group-hover:scale-110 transition duration-200"
                                    />
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition text-[10px] text-white font-bold">
                                      Ingrandisci
                                    </div>
                                  </div>
                                  <p className="text-zinc-400 text-[11px]">
                                    Foto caricata dal cliente. Tocca l'anteprima per visualizzarla a schermo intero.
                                  </p>
                                </div>
                              ) : (
                                <p className="text-zinc-500 italic py-2">
                                  Nessuna foto di esempio allegata per questo appuntamento.
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Pulsanti Azione Barbiere */}
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-zinc-800/80">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-zinc-400">
                                Orario: <strong className="text-amber-400">{timeString}</strong> ({apt.duration_minutes} min)
                              </span>
                              <span className="text-xs text-zinc-400">•</span>
                              <span className="text-xs text-zinc-400">
                                Costo: <strong className="text-white">€{((apt.price_cents || settings.slot_price_cents || 1800) / 100).toFixed(2)}</strong>
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              {!isCompleted && !isCancelled && (
                                <>
                                  <button
                                    type="button"
                                    disabled={actionLoadingId === apt.id}
                                    onClick={() => handleComplete(apt.id)}
                                    className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold flex items-center gap-1.5 transition shadow-sm shadow-emerald-500/20"
                                  >
                                    <CheckCircle2 className="w-4 h-4" />
                                    <span>Completa Taglio (+1 Punto Fedeltà)</span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={actionLoadingId === apt.id}
                                    onClick={() => handleCancel(apt.id)}
                                    className="px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 text-xs font-bold flex items-center gap-1.5 transition"
                                  >
                                    <XCircle className="w-4 h-4 text-red-400" />
                                    <span>Annulla e Libera Orario</span>
                                  </button>
                                </>
                              )}
                              {isCompleted && (
                                <span className="text-xs text-emerald-400 font-bold flex items-center gap-1.5 bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/20">
                                  <CheckCircle2 className="w-4 h-4" /> Taglio Eseguito con Successo
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }

                // Slot Libero: scelta rapida tra Prenotazione Telefono/Banco o Blocco Slot con 1 click
                return (
                  <div
                    key={timeString}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 rounded-xl bg-zinc-950/40 border border-dashed border-zinc-800/80 hover:border-amber-500/40 transition gap-2 group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-zinc-500 text-xs w-12 text-center group-hover:text-amber-400">
                        {timeString}
                      </span>
                      <span className="text-xs text-zinc-500 italic">
                        Orario libero
                      </span>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <button
                        type="button"
                        onClick={() => {
                          setManualBookingModal({
                            isOpen: true,
                            date: selectedDayString,
                            time: timeString,
                          });
                          setManualError(null);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-amber-500 hover:text-black border border-zinc-700 hover:border-amber-500 text-zinc-300 text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
                        title="Inserisci una prenotazione ricevuta al telefono o al banco"
                      >
                        <Phone className="w-3.5 h-3.5 text-amber-400" />
                        <span>Prenota (Telefono / Banco)</span>
                      </button>

                      <button
                        type="button"
                        disabled={actionLoadingId === `block-${timeString}`}
                        onClick={() => handleQuickBlock(selectedDayString, timeString)}
                        className="px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500 hover:text-white border border-red-500/30 text-red-300 text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
                        title="Blocca questo orario con 1 click (pausa o impegno personale)"
                      >
                        {actionLoadingId === `block-${timeString}` ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Ban className="w-3.5 h-3.5 text-red-400" />
                        )}
                        <span>Blocca Slot</span>
                      </button>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      );
    })()}

      {/* ========================================================= */}
      {/* 2. VISTA MESE (Griglia mensile con carico appuntamenti)     */}
      {/* ========================================================= */}
      {viewMode === "month" && (
        <div className="space-y-4">
          <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-zinc-400 pb-2 border-b border-zinc-800">
            <span>Lun</span>
            <span>Mar</span>
            <span>Mer</span>
            <span>Gio</span>
            <span>Ven</span>
            <span>Sab</span>
            <span>Dom</span>
          </div>

          <div className="grid grid-cols-7 gap-2">
            {(() => {
              const daysInMonth = getDaysInMonth(currentDate);
              const firstDayOfMonth = startOfMonth(currentDate);
              // Giorno della settimana (0: Dom, 1: Lun, ..., 6: Sab). In Italia Lun=0
              const startingDayIndex = (getDay(firstDayOfMonth) + 6) % 7;

              const cells = [];

              // Spazi vuoti prima del primo giorno
              for (let i = 0; i < startingDayIndex; i++) {
                cells.push(<div key={`empty-${i}`} className="p-3 opacity-0" />);
              }

              const year = currentDate.getFullYear();
              const month = currentDate.getMonth() + 1;
              const monthStr = month < 10 ? `0${month}` : `${month}`;

              for (let day = 1; day <= daysInMonth; day++) {
                const dayStr = day < 10 ? `0${day}` : `${day}`;
                const dateKey = `${year}-${monthStr}-${dayStr}`;
                const count = appointmentsByDate[dateKey]?.length || 0;
                const isSelected = selectedDayString === dateKey;

                cells.push(
                  <button
                    key={dateKey}
                    type="button"
                    onClick={() => {
                      setSelectedDayString(dateKey);
                      setCurrentDate(new Date(`${dateKey}T00:00:00`));
                      setViewMode("day"); // Cliccando sul giorno passa alla timeline oraria
                    }}
                    className={`min-h-[4.5rem] p-2 rounded-2xl border text-left flex flex-col justify-between transition ${
                      isSelected
                        ? "bg-amber-500/20 border-amber-500"
                        : count > 0
                        ? "bg-zinc-900 border-zinc-800 hover:border-amber-500/40"
                        : "bg-zinc-950/60 border-zinc-900 hover:border-zinc-800"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold ${count > 0 ? "text-zinc-100" : "text-zinc-500"}`}>
                        {day}
                      </span>
                      {count > 0 && (
                        <span className="w-2 h-2 rounded-full bg-amber-400 shadow-sm shadow-amber-400" />
                      )}
                    </div>
                    {count > 0 ? (
                      <span className="text-[11px] font-semibold text-amber-400">
                        {count} {count === 1 ? "appunt." : "appuntamenti"}
                      </span>
                    ) : (
                      <span className="text-[10px] text-zinc-600">Libero</span>
                    )}
                  </button>
                );
              }

              return cells;
            })()}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 3. VISTA ANNO (Carico sui 12 mesi)                        */}
      {/* ========================================================= */}
      {viewMode === "year" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {Array.from({ length: 12 }, (_, i) => {
            const monthDate = new Date(currentDate.getFullYear(), i, 1);
            const monthStr = i + 1 < 10 ? `0${i + 1}` : `${i + 1}`;
            const prefix = `${currentDate.getFullYear()}-${monthStr}`;

            const monthAppointmentsCount = Object.entries(appointmentsByDate)
              .filter(([date]) => date.startsWith(prefix))
              .reduce((sum, [, list]) => sum + list.length, 0);

            return (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setCurrentDate(monthDate);
                  setViewMode("month");
                }}
                className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:border-amber-500/50 hover:bg-zinc-900 transition text-left space-y-2"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-zinc-100 capitalize">
                    {format(monthDate, "MMMM", { locale: it })}
                  </h4>
                  <span className="text-xs text-zinc-500">{currentDate.getFullYear()}</span>
                </div>
                <div>
                  <span className="text-2xl font-black text-amber-400">
                    {monthAppointmentsCount}
                  </span>
                  <span className="text-xs text-zinc-400 block">Prenotazioni totali</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Modal Lookbook Image Preview */}
      {previewImageUrl && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative max-w-lg w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-2xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2">
                <ImageIcon className="w-4 h-4" />
                Foto Esempio Taglio Cliente
              </h3>
              <button
                type="button"
                onClick={() => setPreviewImageUrl(null)}
                className="p-1 rounded-lg bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-hidden rounded-xl bg-black flex items-center justify-center max-h-[60vh]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewImageUrl}
                alt="Foto lookbook taglio desiderato"
                className="object-contain w-full h-full max-h-[60vh]"
              />
            </div>
            <p className="text-xs text-zinc-400 text-center">
              Foto allegata dal cliente in fase di prenotazione.
            </p>
          </div>
        </div>
      )}

      {/* Modal Sincronizzazione Smartphone (Google Calendar / Apple iPhone) */}
      {isSyncModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative max-w-lg w-full bg-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-100">
                    Sincronizza con lo Smartphone
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Google Calendar, iPhone Apple Calendar, Outlook
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSyncModalOpen(false)}
                className="p-1.5 rounded-xl bg-zinc-900 text-zinc-400 hover:text-zinc-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <p className="text-zinc-300 leading-relaxed">
                Tutte le prenotazioni confermate dai clienti sull&apos;app o via Assistente Virtuale
                possono apparire <strong className="text-amber-400">automaticamente nel calendario del tuo telefono</strong>.
              </p>

              {/* Box Link iCal con copia rapida */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                  Link Sottoscrizione Calendario (iCal)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={typeof window !== "undefined" ? `${window.location.origin}/api/calendar/ical` : "/api/calendar/ical"}
                    className="flex-1 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 font-mono text-[11px] text-amber-300 select-all"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        navigator.clipboard.writeText(`${window.location.origin}/api/calendar/ical`);
                        setCopiedSyncUrl(true);
                        setTimeout(() => setCopiedSyncUrl(false), 2500);
                      }
                    }}
                    className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold flex items-center gap-1.5 transition shrink-0"
                  >
                    {copiedSyncUrl ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedSyncUrl ? "Copiato!" : "Copia Link"}</span>
                  </button>
                </div>
              </div>

              {/* Pulsante Diretto per Google Calendar */}
              <div className="pt-2">
                <a
                  href={`https://calendar.google.com/calendar/render?cid=${encodeURIComponent(
                    typeof window !== "undefined"
                      ? `${window.location.origin.replace(/^http/, "webcal")}/api/calendar/ical`
                      : "webcal://smartbarber.local/api/calendar/ical"
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-850 border border-amber-500/40 text-amber-300 font-bold flex items-center justify-center gap-2 transition"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Aggiungi direttamente a Google Calendar</span>
                </a>
              </div>

              {/* Istruzioni pratiche */}
              <div className="p-3.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-2 text-[11px] text-zinc-400">
                <div className="font-bold text-zinc-200">📱 Come configurarlo sul tuo telefono:</div>
                <ul className="list-disc list-inside space-y-1">
                  <li>
                    <strong className="text-zinc-300">iPhone / iPad:</strong> Apri Impostazioni ➔ Calendario ➔ Account ➔ Aggiungi account ➔ Altro ➔ Aggiungi calendario con sottoscrizione e incolla il link copiato.
                  </li>
                  <li>
                    <strong className="text-zinc-300">Android / Google:</strong> Tocca il pulsante qui sopra o vai su Google Calendar da browser, clicca su &quot;Altri calendari (+)&quot; ➔ &quot;Da URL&quot; e incolla il link.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Prenotazione Rapida (Telefono / Al banco) */}
      {manualBookingModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative max-w-md w-full bg-zinc-950 border border-amber-500/30 rounded-3xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                  <Phone className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">
                    Prenotazione Rapida (Telefono / Banco)
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-amber-400 font-semibold">
                    <span>{format(new Date(`${manualBookingModal.date}T00:00:00`), "EEEE d MMMM", { locale: it })}</span>
                    <span>•</span>
                    <span className="font-bold">Ore {manualBookingModal.time}</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setManualBookingModal({ isOpen: false, date: "", time: "" })}
                className="p-1.5 rounded-xl bg-zinc-900 text-zinc-400 hover:text-zinc-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {manualError && (
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
                {manualError}
              </div>
            )}

            <form onSubmit={handleSaveManualBooking} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-zinc-300 flex items-center justify-between">
                  <span>Nome Cliente *</span>
                  <span className="text-[10px] text-amber-400 uppercase font-bold">Richiesto</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Es. Mario Rossi (o Cliente Telefonico)"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 focus:border-amber-500 focus:outline-none text-zinc-100 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-300 flex items-center justify-between">
                  <span>Cellulare (Opzionale)</span>
                  <span className="text-[10px] text-zinc-500">Per promemoria</span>
                </label>
                <input
                  type="tel"
                  placeholder="Es. 347 1234567"
                  value={manualPhone}
                  onChange={(e) => setManualPhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 focus:border-amber-500 focus:outline-none text-zinc-100 text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-300 flex items-center gap-1.5">
                  <Scissors className="w-3.5 h-3.5 text-amber-400" />
                  <span>Trattamento</span>
                </label>
                <select
                  value={manualServiceId}
                  onChange={(e) => setManualServiceId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 focus:border-amber-500 focus:outline-none text-zinc-100 text-xs"
                >
                  {(settings.services || []).map((srv) => (
                    <option key={srv.id} value={srv.id}>
                      {srv.name} — €{(srv.price_cents / 100).toFixed(2)} ({srv.duration_minutes} min)
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-300">Note (Opzionale)</label>
                <input
                  type="text"
                  placeholder="Es. Ha chiamato alle 10:30, preferisce sfumatura bassa"
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-700 focus:border-amber-500 focus:outline-none text-zinc-100 text-xs"
                />
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setManualBookingModal({ isOpen: false, date: "", time: "" })}
                  className="flex-1 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 font-semibold transition"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={manualLoading || !manualName.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold uppercase tracking-wider text-xs transition disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/20"
                >
                  {manualLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span>Salva Appuntamento</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Elenco Promemoria WhatsApp del Giorno */}
      {isReminderBatchModalOpen && (() => {
        const dayApts = appointmentsByDate[selectedDayString] || [];
        const eligible = dayApts.filter(
          (a) =>
            a.status === "confirmed" &&
            a.customer_phone &&
            a.customer_phone !== "BLOCCATO" &&
            !a.customer_name?.startsWith("⛔")
        );

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-zinc-950 border border-emerald-500/30 rounded-3xl w-full max-w-lg p-6 shadow-2xl relative space-y-4 max-h-[90vh] flex flex-col">
              <div className="flex items-start justify-between pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    <MessageCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-zinc-100">
                      Promemoria WhatsApp ({format(new Date(`${selectedDayString}T00:00:00`), "EEEE d MMMM", { locale: it })})
                    </h3>
                    <p className="text-xs text-zinc-400">
                      Invia i promemoria precompilati con un tocco ai clienti in agenda.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsReminderBatchModalOpen(false)}
                  className="p-1.5 rounded-xl bg-zinc-900 text-zinc-400 hover:text-zinc-100 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {eligible.length === 0 ? (
                  <p className="text-xs text-zinc-500 italic py-6 text-center">
                    Nessun appuntamento attivo programmato per questa giornata.
                  </p>
                ) : (
                  eligible.map((apt) => {
                    const isSent = remindersSent[apt.id];
                    const reminderUrl = buildReminderWhatsAppUrl({
                      customerName: apt.customer_name,
                      customerPhone: apt.customer_phone,
                      dateStr: format(new Date(`${apt.appointment_date}T00:00:00`), "EEEE d MMMM", { locale: it }),
                      timeStr: apt.start_time.substring(0, 5),
                    });

                    return (
                      <div
                        key={apt.id}
                        className="flex items-center justify-between p-3 rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 transition gap-2"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-amber-400 text-xs w-11">
                              {apt.start_time.substring(0, 5)}
                            </span>
                            <span className="font-bold text-zinc-200 text-xs">
                              {apt.customer_name}
                            </span>
                            {renderClientBadge(apt.customer_phone)}
                          </div>
                          <span className="text-[11px] text-zinc-400 ml-13 block">
                            {apt.customer_phone}
                          </span>
                        </div>

                        <a
                          href={reminderUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => markReminderSent(apt.id)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition shrink-0 ${
                            isSent
                              ? "bg-zinc-800 text-emerald-400 border border-emerald-500/40"
                              : "bg-emerald-500 hover:bg-emerald-400 text-black shadow-md shadow-emerald-500/20"
                          }`}
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>{isSent ? "Inviato ✓" : "Invia WhatsApp"}</span>
                        </a>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="pt-3 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-500">
                <span>💡 Gratuito: apre WhatsApp ufficiale senza costi SMS o API.</span>
                <button
                  type="button"
                  onClick={() => setIsReminderBatchModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold transition"
                >
                  Chiudi
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

