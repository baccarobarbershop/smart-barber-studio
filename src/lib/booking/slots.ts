import { createAdminClient } from "@/lib/supabase/admin";
import { format, addMinutes, parse, isBefore, isAfter, isEqual, addDays } from "date-fns";
import type { BusinessSettings, CalendarException, Appointment } from "@/types/database";
import { DEFAULT_WEEKLY_SCHEDULE } from "@/types/database";

export interface TimeSlot {
  time: string; // "09:00"
  available: boolean;
  reason?: "past" | "booked" | "lunch" | "closed";
}

export interface DayAvailability {
  date: string; // "YYYY-MM-DD"
  isClosed: boolean;
  closureReason?: string;
  slots: TimeSlot[];
}

/**
 * Timeout di protezione contro blocchi di rete o istanze Supabase in pausa / non raggiungibili.
 */
function withTimeout<T>(promise: PromiseLike<any>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

/**
 * Calcola in modo puramente deterministico e in-memory gli slot orari per un singolo giorno.
 * Esecuzione sub-millisecondo senza chiamate di rete.
 */
export function computeDayAvailability(
  dateString: string,
  settings: Partial<BusinessSettings> | null,
  exception: CalendarException | null,
  bookedAppointments: Pick<Appointment, "start_time" | "end_time" | "duration_minutes" | "status">[] | null,
  now = new Date()
): DayAvailability {
  const slotDuration = settings?.slot_duration_minutes ?? 30;
  const workingDays = settings?.working_days ?? [2, 3, 4, 5, 6]; // Mar - Sab
  let openingTimeStr = settings?.opening_time ?? "09:00:00";
  let closingTimeStr = settings?.closing_time ?? "19:00:00";
  let lunchStartStr: string | null = settings?.lunch_break_start ?? null;
  let lunchEndStr: string | null = settings?.lunch_break_end ?? null;

  const targetDate = new Date(`${dateString}T00:00:00`);
  const dayOfWeek = targetDate.getDay();

  // Configurazione orari giornalieri
  const schedules = settings?.daily_schedules || DEFAULT_WEEKLY_SCHEDULE;
  const daySchedule = schedules?.[dayOfWeek];
  let isStandardClosed = false;

  if (daySchedule) {
    if (!daySchedule.enabled) {
      isStandardClosed = true;
    } else {
      openingTimeStr = daySchedule.opening_time;
      closingTimeStr = daySchedule.closing_time;
      lunchStartStr = daySchedule.has_lunch_break ? daySchedule.lunch_break_start : null;
      lunchEndStr = daySchedule.has_lunch_break ? daySchedule.lunch_break_end : null;
    }
  } else {
    isStandardClosed = !workingDays.includes(dayOfWeek);
  }

  // Chiusure speciali / ferie
  if (exception?.is_closed) {
    return {
      date: dateString,
      isClosed: true,
      closureReason: exception.reason || "Salone chiuso per festività o ferie",
      slots: [],
    };
  }

  // Chiusura ordinaria
  if (isStandardClosed && !exception) {
    return {
      date: dateString,
      isClosed: true,
      closureReason: "Chiusura settimanale ordinaria",
      slots: [],
    };
  }

  // Orari custom da eccezione
  if (exception?.custom_opening_time) {
    openingTimeStr = exception.custom_opening_time;
  }
  if (exception?.custom_closing_time) {
    closingTimeStr = exception.custom_closing_time;
  }

  const slots: TimeSlot[] = [];
  const startTime = parse(openingTimeStr.substring(0, 5), "HH:mm", targetDate);
  const closingTime = parse(closingTimeStr.substring(0, 5), "HH:mm", targetDate);

  let lunchStart: Date | null = null;
  let lunchEnd: Date | null = null;
  if (lunchStartStr && lunchEndStr) {
    lunchStart = parse(lunchStartStr.substring(0, 5), "HH:mm", targetDate);
    lunchEnd = parse(lunchEndStr.substring(0, 5), "HH:mm", targetDate);
  }

  const isToday = format(now, "yyyy-MM-dd") === dateString;
  let currentSlot = startTime;

  while (isBefore(currentSlot, closingTime)) {
    const slotTimeStr = format(currentSlot, "HH:mm");
    const slotEnd = addMinutes(currentSlot, slotDuration);

    if (isAfter(slotEnd, closingTime)) {
      break;
    }

    // Controlla pausa pranzo
    let isLunch = false;
    if (lunchStart && lunchEnd) {
      if (
        (isEqual(currentSlot, lunchStart) || isAfter(currentSlot, lunchStart)) &&
        isBefore(currentSlot, lunchEnd)
      ) {
        isLunch = true;
      }
    }

    // Controlla passato (solo per oggi)
    let isPast = false;
    if (isToday) {
      const slotDateTime = parse(
        `${dateString} ${slotTimeStr}`,
        "yyyy-MM-dd HH:mm",
        now
      );
      if (isBefore(slotDateTime, now)) {
        isPast = true;
      }
    }

    // Sovrapposizione appuntamenti confermati
    let isBooked = false;
    if (bookedAppointments && bookedAppointments.length > 0) {
      for (const apt of bookedAppointments) {
        const aptStartStr = apt.start_time.substring(0, 5);
        const aptDuration = apt.duration_minutes || slotDuration;
        const aptStart = parse(aptStartStr, "HH:mm", targetDate);
        const aptEnd = apt.end_time
          ? parse(apt.end_time.substring(0, 5), "HH:mm", targetDate)
          : addMinutes(aptStart, aptDuration);

        if (isBefore(currentSlot, aptEnd) && isAfter(slotEnd, aptStart)) {
          isBooked = true;
          break;
        }
      }
    }

    let available = true;
    let reason: TimeSlot["reason"] = undefined;

    if (isLunch) {
      available = false;
      reason = "lunch";
    } else if (isPast) {
      available = false;
      reason = "past";
    } else if (isBooked) {
      available = false;
      reason = "booked";
    }

    slots.push({
      time: slotTimeStr,
      available,
      reason,
    });

    currentSlot = addMinutes(currentSlot, slotDuration);
  }

  return {
    date: dateString,
    isClosed: false,
    slots,
  };
}

interface CacheEntry {
  timestamp: number;
  data: DayAvailability[];
}

let rangeCache: { key: string; entry: CacheEntry } | null = null;
const CACHE_TTL_MS = 25_000; // 25 secondi di cache memoria in-process

export function invalidateSlotsCache() {
  rangeCache = null;
}

/**
 * Recupera la disponibilità per una finestra di giorni (es. 14 giorni)
 * in sole 3 query batch eseguite in parallelo (anziché N * 3 query separate).
 * Include timeout di sicurezza anti-freeze e caching rapido in-memory.
 */
export async function getAvailableSlotsForRange(
  startDateStr: string,
  daysCount: number
): Promise<DayAvailability[]> {
  const cacheKey = `${startDateStr}_${daysCount}`;
  if (
    rangeCache &&
    rangeCache.key === cacheKey &&
    Date.now() - rangeCache.entry.timestamp < CACHE_TTL_MS
  ) {
    return rangeCache.entry.data;
  }

  const supabase = createAdminClient();
  const startDate = new Date(`${startDateStr}T00:00:00`);
  const endDate = addDays(startDate, Math.max(1, daysCount) - 1);
  const endDateStr = format(endDate, "yyyy-MM-dd");

  // Esecuzione concorrente protetta da timeout di 2000ms
  const [settingsRes, exceptionsRes, appointmentsRes] = await Promise.all([
    withTimeout(
      supabase.from("business_settings").select("*").limit(1).maybeSingle(),
      2000,
      { data: null, error: null }
    ).catch(() => ({ data: null, error: null })),
    withTimeout(
      supabase
        .from("calendar_exceptions")
        .select("*")
        .gte("exception_date", startDateStr)
        .lte("exception_date", endDateStr),
      2000,
      { data: [], error: null }
    ).catch(() => ({ data: [], error: null })),
    withTimeout(
      supabase
        .from("appointments")
        .select("appointment_date, start_time, end_time, duration_minutes, status")
        .gte("appointment_date", startDateStr)
        .lte("appointment_date", endDateStr)
        .neq("status", "cancelled"),
      2000,
      { data: [], error: null }
    ).catch(() => ({ data: [], error: null })),
  ]);

  const settings = settingsRes?.data as BusinessSettings | null;
  const exceptionsList = (exceptionsRes?.data || []) as CalendarException[];
  const appointmentsList = (appointmentsRes?.data || []) as (Appointment & { appointment_date: string })[];

  const exceptionsMap = new Map<string, CalendarException>();
  for (const exc of exceptionsList) {
    if (exc.exception_date) exceptionsMap.set(exc.exception_date, exc);
  }

  const appointmentsMap = new Map<string, Appointment[]>();
  for (const apt of appointmentsList) {
    if (apt.appointment_date) {
      const existing = appointmentsMap.get(apt.appointment_date) || [];
      existing.push(apt);
      appointmentsMap.set(apt.appointment_date, existing);
    }
  }

  const now = new Date();
  const result: DayAvailability[] = [];

  for (let i = 0; i < daysCount; i++) {
    const targetDate = addDays(startDate, i);
    const dateStr = format(targetDate, "yyyy-MM-dd");
    const exc = exceptionsMap.get(dateStr) || null;
    const apts = appointmentsMap.get(dateStr) || null;

    result.push(computeDayAvailability(dateStr, settings, exc, apts, now));
  }

  rangeCache = {
    key: cacheKey,
    entry: {
      timestamp: Date.now(),
      data: result,
    },
  };

  return result;
}

/**
 * Calcola gli slot per una singola data, sfruttando la funzione unificata batch e cache.
 */
export async function getAvailableSlots(dateString: string): Promise<DayAvailability> {
  const list = await getAvailableSlotsForRange(dateString, 1);
  return list[0] || { date: dateString, isClosed: false, slots: [] };
}
