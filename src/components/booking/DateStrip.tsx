"use client";

import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { format, addDays } from "date-fns";
import { it } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Calendar, Sparkles } from "lucide-react";

interface DateStripProps {
  selectedDate: string; // "YYYY-MM-DD"
  onSelectDate: (date: string) => void;
  daysCount?: number;
}

export function DateStrip({
  selectedDate,
  onSelectDate,
  daysCount = 14,
}: DateStripProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [activeWeek, setActiveWeek] = useState<1 | 2>(1);

  const days = useMemo(() => {
    const today = new Date();
    return Array.from({ length: daysCount }, (_, i) => {
      const date = addDays(today, i);
      return {
        date,
        dateString: format(date, "yyyy-MM-dd"),
        dayName: format(date, "EEE", { locale: it }),
        dayNumber: format(date, "d"),
        monthName: format(date, "MMM", { locale: it }),
        isToday: i === 0,
        dayIndex: i + 1,
      };
    });
  }, [daysCount]);

  const updateScrollButtons = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 12);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 12);

    // Identifica se siamo nella prima settimana (giorni 1-7) o seconda (8-14)
    if (scrollLeft > clientWidth * 0.4) {
      setActiveWeek(2);
    } else {
      setActiveWeek(1);
    }
  }, []);

  useEffect(() => {
    updateScrollButtons();
    const handleResize = () => updateScrollButtons();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [updateScrollButtons, days]);

  const handleScroll = (direction: "left" | "right") => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const scrollAmount = el.clientWidth * 0.75;
    el.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
    setTimeout(updateScrollButtons, 350);
  };

  const jumpToWeek = (week: 1 | 2) => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (week === 1) {
      el.scrollTo({ left: 0, behavior: "smooth" });
    } else {
      el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
    }
    setActiveWeek(week);
    setTimeout(updateScrollButtons, 350);
  };

  // Auto-scroll del giorno selezionato al centro quando cambia
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const selectedBtn = el.querySelector<HTMLButtonElement>(`[data-date="${selectedDate}"]`);
    if (selectedBtn) {
      selectedBtn.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
      setTimeout(updateScrollButtons, 350);
    }
  }, [selectedDate, updateScrollButtons]);

  return (
    <div className="w-full space-y-3">
      {/* Intestazione: Titolo + Badge 14 Giorni + Frecce Navigazione */}
      <div className="flex items-center justify-between gap-2 px-0.5">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider font-bold text-zinc-200 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-amber-400" />
            <span>Seleziona Data</span>
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-extrabold border border-amber-500/30 whitespace-nowrap">
            {daysCount} Giorni
          </span>
        </div>

        {/* Frecce Rapide Prev / Next nel Header */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => handleScroll("left")}
              disabled={!canScrollLeft}
              title="Scorri giorni precedenti"
              className="p-1.5 rounded-lg text-zinc-300 hover:text-amber-400 hover:bg-zinc-800 disabled:opacity-20 disabled:hover:text-zinc-500 transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-[10px] font-mono text-zinc-400 px-1 font-bold">
              {activeWeek === 1 ? "1-7" : `8-${daysCount}`}
            </span>
            <button
              type="button"
              onClick={() => handleScroll("right")}
              disabled={!canScrollRight}
              title="Scorri fino al 14° giorno"
              className="p-1.5 rounded-lg text-zinc-300 hover:text-amber-400 hover:bg-zinc-800 disabled:opacity-20 disabled:hover:text-zinc-500 transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Pill Switcher Settimana 1 / Settimana 2 per accesso rapido ai 14 giorni */}
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => jumpToWeek(1)}
            className={`px-2.5 py-1 rounded-lg font-semibold transition border ${
              activeWeek === 1
                ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                : "bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:text-zinc-200"
            }`}
          >
            Settimana 1 (Oggi - +7gg)
          </button>
          <button
            type="button"
            onClick={() => jumpToWeek(2)}
            className={`px-2.5 py-1 rounded-lg font-semibold transition border ${
              activeWeek === 2
                ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                : "bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:text-zinc-200"
            }`}
          >
            Settimana 2 (+8 - +14gg)
          </button>
        </div>

        <span className="text-xs text-amber-400 font-extrabold capitalize truncate">
          {format(new Date(`${selectedDate}T00:00:00`), "EEEE d MMMM", { locale: it })}
        </span>
      </div>

      {/* RIGA CON FRECCE FLANCANTI FISSE: Impossibile tagliarle o nasconderle */}
      <div className="flex items-center gap-1.5">
        {/* Freccia Sinistra Fissa */}
        <button
          type="button"
          onClick={() => handleScroll("left")}
          disabled={!canScrollLeft}
          title="Scorri a sinistra"
          className="shrink-0 w-8 h-16 rounded-xl bg-zinc-900 hover:bg-zinc-850 active:scale-95 disabled:opacity-25 disabled:pointer-events-none border border-zinc-800 hover:border-amber-500/40 text-amber-400 flex items-center justify-center transition shadow-md"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Contenitore a Scorrimento Orizzontale dei 14 Giorni */}
        <div
          ref={scrollContainerRef}
          onScroll={updateScrollButtons}
          className="flex-1 flex gap-2 overflow-x-auto pb-1 scroll-smooth scrollbar-none snap-x snap-mandatory"
        >
          {days.map((d) => {
            const isSelected = d.dateString === selectedDate;

            return (
              <button
                key={d.dateString}
                data-date={d.dateString}
                type="button"
                onClick={() => onSelectDate(d.dateString)}
                className={`flex flex-col items-center justify-center min-w-[4.4rem] py-2.5 px-1.5 rounded-2xl transition-all duration-200 snap-start border shrink-0 ${
                  isSelected
                    ? "bg-gradient-to-b from-amber-500/25 to-amber-600/35 border-amber-500 text-amber-200 shadow-lg shadow-amber-500/20 scale-[1.02] ring-1 ring-amber-500/60"
                    : "bg-zinc-900/80 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-850 text-zinc-400"
                }`}
              >
                <span
                  className={`text-[10px] font-bold uppercase tracking-tight ${
                    isSelected ? "text-amber-400" : "text-zinc-400"
                  }`}
                >
                  {d.isToday ? "Oggi" : d.dayName}
                </span>
                <span
                  className={`text-lg font-black my-0.5 ${
                    isSelected ? "text-amber-100" : "text-zinc-100"
                  }`}
                >
                  {d.dayNumber}
                </span>
                <span
                  className={`text-[9px] uppercase tracking-wide font-medium ${
                    isSelected ? "text-amber-300" : "text-zinc-500"
                  }`}
                >
                  {d.monthName}
                </span>
              </button>
            );
          })}
        </div>

        {/* Freccia Destra Fissa */}
        <button
          type="button"
          onClick={() => handleScroll("right")}
          disabled={!canScrollRight}
          title="Scorri a destra (fino al 14° giorno)"
          className="shrink-0 w-8 h-16 rounded-xl bg-zinc-900 hover:bg-zinc-850 active:scale-95 disabled:opacity-25 disabled:pointer-events-none border border-zinc-800 hover:border-amber-500/40 text-amber-400 flex items-center justify-center transition shadow-md"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
