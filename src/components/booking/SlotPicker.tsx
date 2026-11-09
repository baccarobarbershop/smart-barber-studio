"use client";

import type { TimeSlot } from "@/lib/booking/slots";
import { Clock, AlertCircle } from "lucide-react";

interface SlotPickerProps {
  slots: TimeSlot[];
  isClosed: boolean;
  closureReason?: string;
  selectedSlot: string | null;
  onSelectSlot: (time: string) => void;
  isLoading?: boolean;
}

export function SlotPicker({
  slots,
  isClosed,
  closureReason,
  selectedSlot,
  onSelectSlot,
  isLoading,
}: SlotPickerProps) {
  if (isLoading) {
    return (
      <div className="py-12 flex flex-col items-center justify-center space-y-3">
        <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
        <span className="text-xs text-zinc-400 font-medium">Verifica disponibilità in tempo reale...</span>
      </div>
    );
  }

  if (isClosed) {
    return (
      <div className="py-8 px-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 text-center space-y-3">
        <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto">
          <AlertCircle className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-zinc-200">Salone Chiuso</h4>
          <p className="text-xs text-zinc-400">{closureReason || "Nessun appuntamento disponibile per questa data."}</p>
        </div>
      </div>
    );
  }

  const availableCount = slots.filter((s) => s.available).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-amber-400" />
          <span>Orari disponibili</span>
        </div>
        <span>
          <strong className="text-amber-400 font-semibold">{availableCount}</strong> posti liberi
        </span>
      </div>

      {slots.length === 0 ? (
        <div className="py-8 text-center text-xs text-zinc-500">
          Nessuno slot configurato per questo giorno.
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
          {slots.map((slot) => {
            const isSelected = selectedSlot === slot.time;
            const isAvailable = slot.available;
            const isBooked = slot.reason === "booked";
            const isLunch = slot.reason === "lunch";
            const isPast = slot.reason === "past";

            return (
              <button
                key={slot.time}
                type="button"
                disabled={!isAvailable}
                onClick={() => onSelectSlot(slot.time)}
                className={`py-2.5 px-1.5 rounded-xl text-center text-sm font-semibold transition-all duration-150 border flex flex-col items-center justify-center ${
                  isSelected
                    ? "bg-amber-500 text-black border-amber-400 shadow-md shadow-amber-500/30 scale-[1.03]"
                    : isAvailable
                    ? "bg-zinc-900/90 hover:bg-zinc-800 text-zinc-100 border-zinc-800 hover:border-amber-500/50 shadow-sm"
                    : isBooked
                    ? "bg-red-950/20 text-zinc-500 border-red-500/20 cursor-not-allowed opacity-70"
                    : "bg-zinc-950/50 text-zinc-600 border-zinc-900 cursor-not-allowed opacity-40"
                }`}
              >
                <span className={!isAvailable ? "line-through text-xs font-bold" : "text-sm font-bold"}>
                  {slot.time}
                </span>
                <span className="text-[9px] font-semibold mt-0.5">
                  {isAvailable && <span className="text-emerald-400">Libero</span>}
                  {isBooked && <span className="text-red-400 font-bold uppercase tracking-wider">Occupato</span>}
                  {isLunch && <span className="text-zinc-500">Pausa</span>}
                  {isPast && <span className="text-zinc-600">Passato</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

