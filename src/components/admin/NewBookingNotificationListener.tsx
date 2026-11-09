"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { playLuxuryBookingChime } from "@/lib/sound";
import type { Appointment, BusinessSettings } from "@/types/database";
import { Bell, Sparkles, X, Clock, Calendar as CalendarIcon, User } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface NewBookingNotificationListenerProps {
  settings: BusinessSettings;
  onNewAppointment?: (newApt: Appointment) => void;
}

interface ToastNotification {
  id: string;
  customerName: string;
  timeStr: string;
  dateStr: string;
}

export function NewBookingNotificationListener({
  settings,
  onNewAppointment,
}: NewBookingNotificationListenerProps) {
  const [toast, setToast] = useState<ToastNotification | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel("realtime_new_appointments_listener")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "appointments",
        },
        (payload) => {
          const newApt = payload.new as Appointment;
          if (!newApt) return;

          // Ignora i blocchi o pause inserite manualmente dal barbiere
          const isBlocked =
            newApt.customer_phone === "BLOCCATO" ||
            newApt.customer_name?.startsWith("⛔");

          if (isBlocked) return;

          // Se il tocco sonoro è attivo (predefinito true se non esplicitamente disattivato)
          if (settings.enable_new_booking_sound !== false) {
            playLuxuryBookingChime();
          }

          // Notifica visiva toast elegante
          let formattedDate = newApt.appointment_date;
          try {
            formattedDate = format(
              new Date(`${newApt.appointment_date}T00:00:00`),
              "EEEE d MMMM",
              { locale: it }
            );
          } catch {}

          setToast({
            id: newApt.id || Date.now().toString(),
            customerName: newApt.customer_name || "Nuovo Cliente",
            timeStr: newApt.start_time?.substring(0, 5) || "",
            dateStr: formattedDate,
          });

          // Notifica il componente genitore per aggiornare il calendario in tempo reale
          onNewAppointment?.(newApt);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [settings.enable_new_booking_sound, onNewAppointment]);

  // Auto-chiusura del toast dopo 7 secondi
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;

  return (
    <div className="fixed top-5 right-5 z-50 max-w-sm w-full animate-in slide-in-from-top-4 duration-300 pointer-events-auto">
      <div className="p-4 rounded-2xl bg-zinc-950/95 border-2 border-amber-500/60 shadow-2xl shadow-amber-500/20 backdrop-blur-md flex items-start gap-3">
        <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 shrink-0">
          <Sparkles className="w-5 h-5 animate-pulse" />
        </div>

        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
              <Bell className="w-3 h-3" />
              Nuova Prenotazione in Tempo Reale
            </span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="text-sm font-black text-white flex items-center gap-1.5 pt-0.5">
            <User className="w-3.5 h-3.5 text-zinc-400" />
            <span>{toast.customerName}</span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-300 pt-0.5">
            <span className="flex items-center gap-1 font-semibold text-amber-300">
              <Clock className="w-3 h-3 text-amber-400" />
              {toast.timeStr}
            </span>
            <span className="text-zinc-500">•</span>
            <span className="flex items-center gap-1 text-zinc-400 capitalize">
              <CalendarIcon className="w-3 h-3" />
              {toast.dateStr}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

