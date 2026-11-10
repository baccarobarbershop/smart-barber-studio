"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { DateStrip } from "./DateStrip";
import { SlotPicker } from "./SlotPicker";
import { BookingModal } from "./BookingModal";
import { ManageAppointmentModal } from "./ManageAppointmentModal";
import { fetchDayAvailability } from "@/app/actions/availability";
import type { DayAvailability } from "@/lib/booking/slots";
import { Sparkles, MessageSquare, ArrowLeft, CalendarCheck } from "lucide-react";
import Link from "next/link";

interface BookingViewProps {
  initialDate?: string;
  initialAvailability?: DayAvailability;
  maxDays?: number;
}

export function BookingView({
  initialDate,
  initialAvailability,
  maxDays = 14,
}: BookingViewProps) {
  const todayStr = initialDate || format(new Date(), "yyyy-MM-dd");
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [availability, setAvailability] = useState<DayAvailability | null>(
    initialAvailability || null
  );
  const [isLoading, setIsLoading] = useState<boolean>(!initialAvailability);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isManageModalOpen, setIsManageModalOpen] = useState<boolean>(false);

  const loadSlots = async (dateStr: string) => {
    setIsLoading(true);
    setSelectedSlot(null);
    try {
      const res = await fetchDayAvailability(dateStr);
      setAvailability(res);
    } catch (err) {
      console.error("Errore nel caricamento slot:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedDate !== initialDate || !initialAvailability) {
      loadSlots(selectedDate);
    }
  }, [selectedDate]);

  const handleSelectSlot = (slotTime: string) => {
    setSelectedSlot(slotTime);
    setIsModalOpen(true);
  };

  return (
    <div className="w-full max-w-lg mx-auto p-4 sm:p-6 space-y-6">
      {/* Header con navigazione e switch verso la Chat AI */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-amber-400 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Home</span>
        </Link>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setIsManageModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-[11px] sm:text-xs font-semibold transition whitespace-nowrap"
          >
            <CalendarCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="hidden xs:inline">I Miei </span><span>Appuntamenti</span>
          </button>

          <Link
            href="/chat"
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[11px] sm:text-xs font-semibold transition whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="hidden xs:inline">Assistente </span><span>AI</span>
          </Link>
        </div>
      </div>

      {/* Titolo e introduzione */}
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
          Prenota il tuo <span className="gold-gradient-text">Taglio</span>
        </h1>
        <p className="text-xs text-zinc-400">
          Scegli giorno e orario desiderati. Nessuna attesa in salone.
        </p>
      </div>

      {/* Date Strip (14 giorni orizzontale) */}
      <div className="glass-panel rounded-2xl p-4 sm:p-5">
        <DateStrip
          selectedDate={selectedDate}
          onSelectDate={(newDate) => setSelectedDate(newDate)}
          daysCount={maxDays}
        />
      </div>

      {/* Griglia degli Slot Orari */}
      <div className="glass-panel rounded-2xl p-5">
        <SlotPicker
          slots={availability?.slots || []}
          isClosed={availability?.isClosed || false}
          closureReason={availability?.closureReason}
          selectedSlot={selectedSlot}
          onSelectSlot={handleSelectSlot}
          isLoading={isLoading}
        />
      </div>

      {/* Modale di Conferma / Name Capture */}
      {selectedSlot && (
        <BookingModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedSlot(null);
            // Ricarica la disponibilità per aggiornare lo slot occupato
            loadSlots(selectedDate);
          }}
          date={selectedDate}
          time={selectedSlot}
          onBookingSuccess={() => {
            loadSlots(selectedDate);
          }}
        />
      )}

      {/* Modale Gestione / Disdetta Veloce */}
      <ManageAppointmentModal
        isOpen={isManageModalOpen}
        onClose={() => setIsManageModalOpen(false)}
        onSuccessAction={() => loadSlots(selectedDate)}
      />
    </div>
  );
}

