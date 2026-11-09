import { createAdminClient } from "@/lib/supabase/admin";
import { format, addMinutes, parse, isBefore, isAfter, isEqual } from "date-fns";
import type { BusinessSettings, CalendarException, Appointment } from "@/types/database";

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
 * Calcola in modo deterministico e rigoroso tutti gli slot orari disponibili per una data specifica.
 * Rispetta:
 * - Orario di apertura e chiusura da business_settings
 * - Durata dello slot configurata (es. 15, 30, 45, 60 min)
 * - Pausa pranzo (lunch_break_start / lunch_break_end)
 * - Giorni lavorativi settimanali (es. 1-6 = Lun-Sab)
 * - Eccezioni da calendar_exceptions (chiusure per ferie/festivi o orari speciali)
 * - Appuntamenti già confermati nel database (usando AdminClient per bypassare RLS e garantire zero allucinazioni)
 * - Orari già passati (se la data è oggi)
 */
export async function getAvailableSlots(dateString: string): Promise<DayAvailability> {
  const supabase = createAdminClient();

  // 1. Recupera impostazioni del salone
  const { data: settings } = await supabase
    .from("business_settings")
    .select("*")
    .limit(1)
    .single();

  const slotDuration = settings?.slot_duration_minutes ?? 30;
  const workingDays = settings?.working_days ?? [1, 2, 3, 4, 5, 6]; // Lun - Sab
  let openingTimeStr = settings?.opening_time ?? "09:00:00";
  let closingTimeStr = settings?.closing_time ?? "19:30:00";
  let lunchStartStr: string | null = settings?.lunch_break_start ?? "13:00:00";
  let lunchEndStr: string | null = settings?.lunch_break_end ?? "14:30:00";

  // 2. Verifica giorno della settimana (0: Domenica, 1: Lunedì, ..., 6: Sabato)
  const targetDate = new Date(`${dateString}T00:00:00`);
  const dayOfWeek = targetDate.getDay();

  // Se è configurato un orario per singolo giorno della settimana:
  const daySchedule = settings?.daily_schedules?.[dayOfWeek];
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

  // 3. Verifica eccezioni da calendario
  const { data: exception } = await supabase
    .from("calendar_exceptions")
    .select("*")
    .eq("exception_date", dateString)
    .maybeSingle();

  if (exception?.is_closed) {
    return {
      date: dateString,
      isClosed: true,
      closureReason: exception.reason || "Salone chiuso per festività o ferie",
      slots: [],
    };
  }

  // Se non c'è eccezione di apertura straordinaria ed è chiuso da orario settimanale
  if (isStandardClosed && !exception) {
    return {
      date: dateString,
      isClosed: true,
      closureReason: "Chiusura settimanale ordinaria",
      slots: [],
    };
  }

  // Se c'è un'eccezione con orari custom
  if (exception?.custom_opening_time) {
    openingTimeStr = exception.custom_opening_time;
  }
  if (exception?.custom_closing_time) {
    closingTimeStr = exception.custom_closing_time;
  }

  // 4. Recupera appuntamenti attivi (confermati o completati, non cancellati)
  const { data: bookedAppointments, error: aptError } = await supabase
    .from("appointments")
    .select("start_time, end_time, duration_minutes, status")
    .eq("appointment_date", dateString)
    .neq("status", "cancelled");

  if (aptError) {
    console.error("Errore fetch appuntamenti in getAvailableSlots:", aptError);
  }

  // 5. Genera la timeline degli slot
  const slots: TimeSlot[] = [];
  const startTime = parse(openingTimeStr.substring(0, 5), "HH:mm", targetDate);
  const closingTime = parse(closingTimeStr.substring(0, 5), "HH:mm", targetDate);

  let lunchStart: Date | null = null;
  let lunchEnd: Date | null = null;
  if (lunchStartStr && lunchEndStr) {
    lunchStart = parse(lunchStartStr.substring(0, 5), "HH:mm", targetDate);
    lunchEnd = parse(lunchEndStr.substring(0, 5), "HH:mm", targetDate);
  }

  const now = new Date();
  const isToday = format(now, "yyyy-MM-dd") === dateString;

  let currentSlot = startTime;

  while (isBefore(currentSlot, closingTime)) {
    const slotTimeStr = format(currentSlot, "HH:mm");
    const slotEnd = addMinutes(currentSlot, slotDuration);

    // Controlla se lo slot supera l'orario di chiusura
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

    // Controlla se è nel passato (se oggi)
    let isPast = false;
    if (isToday) {
      const slotDateTime = parse(
        `${dateString} ${slotTimeStr}`,
        "yyyy-MM-dd HH:mm",
        new Date()
      );
      if (isBefore(slotDateTime, now)) {
        isPast = true;
      }
    }

    // Controlla sovrapposizione con appuntamenti già registrati
    let isBooked = false;
    if (bookedAppointments && bookedAppointments.length > 0) {
      for (const apt of bookedAppointments) {
        const aptStartStr = apt.start_time.substring(0, 5);
        const aptDuration = apt.duration_minutes || slotDuration;
        const aptStart = parse(aptStartStr, "HH:mm", targetDate);
        const aptEnd = apt.end_time
          ? parse(apt.end_time.substring(0, 5), "HH:mm", targetDate)
          : addMinutes(aptStart, aptDuration);

        // Un intervallo [slotStart, slotEnd) si sovrappone a [aptStart, aptEnd)
        // se slotStart < aptEnd && slotEnd > aptStart
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

