"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { format, addMinutes, parse } from "date-fns";
import { revalidatePath } from "next/cache";
import fs from "fs";
import path from "path";
import type { BusinessSettings, Appointment, CalendarException, BarberService } from "@/types/database";
import { normalizePhoneDigits } from "@/lib/phone";

function getLocalServicesFilePath() {
  return path.join(process.cwd(), "src", "data", "salon_services.json");
}

function readLocalServices(): BarberService[] | null {
  try {
    const filePath = getLocalServicesFilePath();
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.error("Errore lettura local services:", err);
  }
  return null;
}

function writeLocalServices(services: BarberService[]) {
  try {
    const filePath = getLocalServicesFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(services, null, 2), "utf-8");
  } catch (err) {
    console.error("Errore scrittura local services:", err);
  }
}

function readLocalContacts(): { salon_phone: string; whatsapp_phone: string } {
  try {
    const filePath = path.join(process.cwd(), "src", "data", "salon_contacts.json");
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch (err) {
    console.error("Errore lettura local contacts:", err);
  }
  return { salon_phone: "331 81 76 178", whatsapp_phone: "331 81 76 178" };
}

function writeLocalContacts(contacts: { salon_phone?: string; whatsapp_phone?: string }) {
  try {
    const filePath = path.join(process.cwd(), "src", "data", "salon_contacts.json");
    const current = readLocalContacts();
    const updated = {
      salon_phone: contacts.salon_phone ?? current.salon_phone,
      whatsapp_phone: contacts.whatsapp_phone ?? current.whatsapp_phone,
    };
    fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), "utf-8");
  } catch (err) {
    console.error("Errore scrittura local contacts:", err);
  }
}

function getClientNotesFilePath() {
  return path.join(process.cwd(), "src", "data", "client_internal_notes.json");
}

function readAllInternalNotes(): Record<string, string> {
  try {
    const filePath = getClientNotesFilePath();
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch (e) {
    console.error("Errore lettura client_internal_notes.json:", e);
  }
  return {};
}

function writeAllInternalNotes(data: Record<string, string>) {
  try {
    const filePath = getClientNotesFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    console.error("Errore scrittura client_internal_notes.json:", e);
  }
}

/**
 * Recupera tutte le note interne riservate del barbiere, indicizzate per numero di telefono (cifre pulite).
 */
export async function getAllClientInternalNotes(): Promise<Record<string, string>> {
  return readAllInternalNotes();
}

/**
 * Aggiorna la nota interna riservata per uno specifico cliente (abitudini, taglio preferito, dettagli riservati).
 */
export async function updateClientInternalNotes(
  phone: string,
  notes: string
): Promise<{ success: boolean; notes: string; error?: string }> {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits) {
    return { success: false, notes: "", error: "Numero di telefono non valido." };
  }

  const allNotes = readAllInternalNotes();
  const trimmed = notes.trim();
  if (trimmed) {
    allNotes[digits] = trimmed;
  } else {
    delete allNotes[digits];
  }
  writeAllInternalNotes(allNotes);

  try {
    const adminClient = createAdminClient();
    await adminClient
      .from("profiles")
      .update({ internal_notes: trimmed || null } as any)
      .eq("phone", phone);
  } catch {
    // Il file locale funge da storage primario sicuro e persistente
  }

  return { success: true, notes: trimmed };
}

export async function getAdminSettings(): Promise<BusinessSettings | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("business_settings")
    .select("*")
    .limit(1)
    .single();

  if (data) {
    if (!data.services || !Array.isArray(data.services) || data.services.length === 0) {
      const local = readLocalServices();
      if (local && local.length > 0) {
        data.services = local;
      }
    }
    const contacts = readLocalContacts();
    if (!data.salon_phone) data.salon_phone = contacts.salon_phone;
    if (!data.whatsapp_phone) data.whatsapp_phone = contacts.whatsapp_phone;
  }

  return data;
}

export async function updateAdminSettings(
  updated: Partial<BusinessSettings>
): Promise<{ success: boolean; error?: string }> {
  // Salva sempre i servizi in cache locale sincronizzata per reattività garantita
  if (updated.services && Array.isArray(updated.services)) {
    writeLocalServices(updated.services as BarberService[]);
  }

  // Salva sempre i contatti telefonici e whatsapp in cache locale
  if (updated.salon_phone !== undefined || updated.whatsapp_phone !== undefined) {
    writeLocalContacts({
      salon_phone: updated.salon_phone,
      whatsapp_phone: updated.whatsapp_phone,
    });
  }

  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from("business_settings")
    .update({
      ...updated,
      updated_at: new Date().toISOString(),
    })
    .eq("id", "00000000-0000-0000-0000-000000000001");

  if (error) {
    if (
      error.message.includes("daily_schedules") ||
      error.message.includes("fidelity_card_enabled") ||
      error.message.includes("services") ||
      error.message.includes("salon_phone") ||
      error.message.includes("whatsapp_phone")
    ) {
      const { daily_schedules, fidelity_card_enabled, services, salon_phone, whatsapp_phone, ...fallbackData } = updated;
      const { error: retryError } = await adminClient
        .from("business_settings")
        .update({
          ...fallbackData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", "00000000-0000-0000-0000-000000000001");

      if (retryError) return { success: false, error: retryError.message };
      revalidatePath("/");
      revalidatePath("/admin");
      revalidatePath("/chat");
      revalidatePath("/book");
      return { success: true };
    }
    return { success: false, error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/chat");
  revalidatePath("/book");
  return { success: true };
}

export async function fetchCalendarOverview(params: {
  year: number;
  month?: number; // 1-12
  date?: string; // YYYY-MM-DD
}): Promise<Appointment[]> {
  const adminClient = createAdminClient();

  let query = adminClient
    .from("appointments")
    .select(`
      *,
      profile:profiles(id, full_name, phone, fidelity_points)
    `)
    .order("appointment_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (params.date) {
    query = query.eq("appointment_date", params.date);
  } else if (params.month) {
    const monthStr = params.month < 10 ? `0${params.month}` : `${params.month}`;
    const startMonth = `${params.year}-${monthStr}-01`;
    const endMonth = `${params.year}-${monthStr}-31`;
    query = query.gte("appointment_date", startMonth).lte("appointment_date", endMonth);
  } else {
    const startYear = `${params.year}-01-01`;
    const endYear = `${params.year}-12-31`;
    query = query.gte("appointment_date", startYear).lte("appointment_date", endYear);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Errore fetch calendar overview:", error);
    return [];
  }

  return (data as unknown as Appointment[]) || [];
}

/**
 * Completa un appuntamento ed accredita automaticamente +1 punto fedeltà al profilo del cliente.
 */
export async function completeAppointment(
  appointmentId: string
): Promise<{ success: boolean; pointsAwarded?: number; error?: string }> {
  const adminClient = createAdminClient();

  // 1. Recupera l'appuntamento
  const { data: apt, error: fetchErr } = await adminClient
    .from("appointments")
    .select("id, user_id, customer_phone, customer_name, status, points_awarded")
    .eq("id", appointmentId)
    .single();

  if (fetchErr || !apt) {
    return { success: false, error: "Appuntamento non trovato." };
  }

  if (apt.status === "completed") {
    return { success: true, pointsAwarded: 0 };
  }

  // 2. Aggiorna stato appuntamento a completed ed incassa
  const { error: updateErr } = await adminClient
    .from("appointments")
    .update({
      status: "completed",
      payment_status: "paid",
      updated_at: new Date().toISOString(),
    })
    .eq("id", appointmentId);

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  // 3. Incrementa punti fedeltà nel profilo cliente (cerca per user_id oppure per numero di telefono)
  const pointsToAdd = apt.points_awarded || 1;
  let targetProfileId = apt.user_id;

  if (!targetProfileId && apt.customer_phone) {
    const { data: profByPhone } = await adminClient
      .from("profiles")
      .select("id")
      .eq("phone", apt.customer_phone.trim())
      .maybeSingle();

    targetProfileId = profByPhone?.id;
  }

  if (targetProfileId) {
    const { data: profile } = await adminClient
      .from("profiles")
      .select("fidelity_points")
      .eq("id", targetProfileId)
      .single();

    const currentPoints = profile?.fidelity_points ?? 0;
    const newPoints = currentPoints + pointsToAdd;

    await adminClient
      .from("profiles")
      .update({
        fidelity_points: newPoints,
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetProfileId);
  } else if (apt.customer_phone) {
    // Se non esiste ancora record in profiles, crealo con il punto accreditato
    const cleanDigits = apt.customer_phone.replace(/\D/g, "");
    const guestEmail = `guest_${cleanDigits}@smartbarber.local`;

    const { data: authUser } = await adminClient.auth.admin.createUser({
      email: guestEmail,
      email_confirm: true,
      user_metadata: {
        full_name: apt.customer_name,
        phone: apt.customer_phone,
        role: "client",
      },
    });

    if (authUser?.user) {
      await adminClient.from("profiles").upsert({
        id: authUser.user.id,
        full_name: apt.customer_name,
        phone: apt.customer_phone,
        role: "client",
        fidelity_points: pointsToAdd,
      });

      await adminClient
        .from("appointments")
        .update({ user_id: authUser.user.id })
        .eq("id", appointmentId);
    }
  }

  return { success: true, pointsAwarded: pointsToAdd };
}

/**
 * Recupera l'elenco di tutti i clienti con i rispettivi punti fedeltà, storico e conteggio No-Show.
 */
export async function fetchClientsFidelityList(): Promise<
  Array<{
    id: string;
    full_name: string;
    phone: string;
    fidelity_points: number;
    no_show_count: number;
    is_no_show_blocked: boolean;
    internal_notes?: string | null;
    created_at: string;
    updated_at: string;
  }>
> {
  const adminClient = createAdminClient();

  const { data: profiles, error } = await adminClient
    .from("profiles")
    .select(`
      id,
      full_name,
      phone,
      fidelity_points,
      created_at,
      updated_at
    `)
    .order("fidelity_points", { ascending: false });

  if (error) {
    console.error("Errore fetch profiles fedeltà:", error);
    return [];
  }

  // Recupera tutti gli appuntamenti con stato 'no_show' per conteggiare le mancate presentazioni
  const { data: noShowApts } = await adminClient
    .from("appointments")
    .select("customer_phone")
    .eq("status", "no_show");

  const noShowCountMap = new Map<string, number>();
  (noShowApts || []).forEach((apt) => {
    const digits = (apt.customer_phone || "").replace(/\D/g, "");
    if (digits) {
      noShowCountMap.set(digits, (noShowCountMap.get(digits) || 0) + 1);
    }
  });

  const allNotes = readAllInternalNotes();

  return (profiles || []).map((prof) => {
    const profDigits = (prof.phone || "").replace(/\D/g, "");
    const count = noShowCountMap.get(profDigits) || 0;
    return {
      ...prof,
      no_show_count: count,
      is_no_show_blocked: count >= 3,
      internal_notes: allNotes[profDigits] || null,
    };
  });
}

export interface ClientBadgeInfo {
  phoneDigits: string;
  fullName?: string;
  completedCuts: number;
  totalBookings: number;
  fidelityPoints: number;
  noShowCount: number;
  isNewCustomer: boolean;
  isReturning: boolean;
  isVipLoyal: boolean;
}

/**
 * Recupera le statistiche e i badge di fidelizzazione per tutti i clienti
 * basandosi sugli appuntamenti completati e sui punti fedeltà nel database.
 */
export async function fetchClientBadgesMap(): Promise<Record<string, ClientBadgeInfo>> {
  const adminClient = createAdminClient();

  const { data: apts, error: aptsErr } = await adminClient
    .from("appointments")
    .select("customer_phone, customer_name, status");

  if (aptsErr) {
    console.error("Errore fetch appuntamenti per badges clienti:", aptsErr);
    return {};
  }

  const { data: profiles } = await adminClient
    .from("profiles")
    .select("phone, fidelity_points, full_name");

  const fidelityMap = new Map<string, { points: number; name: string }>();
  (profiles || []).forEach((p) => {
    const digits = normalizePhoneDigits(p.phone);
    if (digits) {
      fidelityMap.set(digits, { points: p.fidelity_points || 0, name: p.full_name || "" });
    }
  });

  const resultMap: Record<string, ClientBadgeInfo> = {};

  // Inizializza dai profili esistenti
  (profiles || []).forEach((p) => {
    const digits = normalizePhoneDigits(p.phone);
    if (!digits) return;
    resultMap[digits] = {
      phoneDigits: digits,
      fullName: p.full_name || "",
      completedCuts: 0,
      totalBookings: 0,
      fidelityPoints: p.fidelity_points || 0,
      noShowCount: 0,
      isNewCustomer: true,
      isReturning: false,
      isVipLoyal: false,
    };
  });

  // Aggrega gli appuntamenti
  (apts || []).forEach((apt) => {
    const digits = normalizePhoneDigits(apt.customer_phone);
    if (!digits || apt.customer_phone === "BLOCCATO") return;

    if (!resultMap[digits]) {
      const prof = fidelityMap.get(digits);
      resultMap[digits] = {
        phoneDigits: digits,
        fullName: prof?.name || apt.customer_name || "",
        completedCuts: 0,
        totalBookings: 0,
        fidelityPoints: prof?.points || 0,
        noShowCount: 0,
        isNewCustomer: true,
        isReturning: false,
        isVipLoyal: false,
      };
    }

    resultMap[digits].totalBookings += 1;
    if (apt.status === "completed") {
      resultMap[digits].completedCuts += 1;
    } else if (apt.status === "no_show") {
      resultMap[digits].noShowCount += 1;
    }
  });

  // Calcolo classificazione badge clienti
  Object.values(resultMap).forEach((info) => {
    info.isNewCustomer = info.completedCuts === 0;
    info.isReturning = info.completedCuts >= 1 && info.completedCuts < 5;
    info.isVipLoyal = info.completedCuts >= 5;
  });

  return resultMap;
}

/**
 * Modifica manualmente i punti di un cliente (es. +1 punto omaggio o correzione).
 */
export async function adjustClientFidelityPoints(
  profileId: string,
  delta: number
): Promise<{ success: boolean; newPoints?: number; error?: string }> {
  const adminClient = createAdminClient();

  const { data: profile, error: fetchErr } = await adminClient
    .from("profiles")
    .select("fidelity_points")
    .eq("id", profileId)
    .single();

  if (fetchErr || !profile) {
    return { success: false, error: "Cliente non trovato." };
  }

  const currentPoints = profile.fidelity_points || 0;
  const newPoints = Math.max(0, currentPoints + delta);

  const { error: updateErr } = await adminClient
    .from("profiles")
    .update({
      fidelity_points: newPoints,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profileId);

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  return { success: true, newPoints };
}

/**
 * Riscatta il premio fedeltà per il cliente (scala i punti target o resetta dopo l'erogazione del premio).
 */
export async function redeemClientReward(
  profileId: string
): Promise<{ success: boolean; newPoints?: number; error?: string }> {
  const adminClient = createAdminClient();

  // Recupera impostazioni salone per conoscere il target
  const { data: settings } = await adminClient
    .from("business_settings")
    .select("fidelity_target_points")
    .limit(1)
    .single();

  const targetPoints = settings?.fidelity_target_points ?? 10;

  const { data: profile } = await adminClient
    .from("profiles")
    .select("fidelity_points")
    .eq("id", profileId)
    .single();

  if (!profile) return { success: false, error: "Profilo non trovato." };

  const currentPoints = profile.fidelity_points || 0;
  const newPoints = Math.max(0, currentPoints - targetPoints);

  const { error: updateErr } = await adminClient
    .from("profiles")
    .update({
      fidelity_points: newPoints,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profileId);

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  return { success: true, newPoints };
}

/**
 * Annulla un appuntamento (libera lo slot)
 */
export async function cancelAppointmentByAdmin(
  appointmentId: string
): Promise<{ success: boolean; error?: string }> {
  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from("appointments")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", appointmentId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Rileva gli appuntamenti passati (terminati nel giorno corrente o giorni precedenti)
 * che risultano ancora in stato 'confirmed' e non sono ancora stati evasi o confermati dal barbiere.
 */
export async function checkUnconfirmedPastAppointments(): Promise<Appointment[]> {
  const adminClient = createAdminClient();
  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");
  const currentTimeStr = format(now, "HH:mm:ss");

  // Appuntamenti di giorni precedenti ancora confermati
  const { data: pastDaysApts } = await adminClient
    .from("appointments")
    .select(`
      *,
      profile:profiles(id, full_name, phone, fidelity_points)
    `)
    .lt("appointment_date", todayStr)
    .eq("status", "confirmed")
    .order("appointment_date", { ascending: false });

  // Appuntamenti di oggi il cui orario di fine è già trascorso
  const { data: todayPastApts } = await adminClient
    .from("appointments")
    .select(`
      *,
      profile:profiles(id, full_name, phone, fidelity_points)
    `)
    .eq("appointment_date", todayStr)
    .lte("end_time", currentTimeStr)
    .eq("status", "confirmed")
    .order("start_time", { ascending: true });

  const combined = [...(todayPastApts || []), ...(pastDaysApts || [])];
  return (combined as unknown as Appointment[]) || [];
}

/**
 * Evade ed accredita i punti fedeltà in batch per una lista di appuntamenti passati.
 */
export async function batchCompleteAppointments(
  appointmentIds: string[]
): Promise<{ success: boolean; completedCount: number }> {
  let count = 0;
  for (const id of appointmentIds) {
    const res = await completeAppointment(id);
    if (res.success) {
      count++;
    }
  }
  return { success: true, completedCount: count };
}

/**
 * Segna un appuntamento come non presentato (no-show), non assegnando punti.
 */
export async function markAppointmentNoShow(
  appointmentId: string
): Promise<{ success: boolean; error?: string }> {
  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from("appointments")
    .update({
      status: "no_show",
      updated_at: new Date().toISOString(),
    })
    .eq("id", appointmentId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Recupera l'elenco delle chiusure straordinarie, festività e ferie.
 */
export async function fetchCalendarExceptions(): Promise<CalendarException[]> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("calendar_exceptions")
    .select("*")
    .order("exception_date", { ascending: true });

  if (error) {
    console.error("Errore fetchCalendarExceptions:", error);
    return [];
  }
  return data || [];
}

/**
 * Aggiunge un giorno di chiusura straordinaria o ferie.
 */
export async function addCalendarException(input: {
  exception_date: string;
  reason: string;
  is_closed?: boolean;
}): Promise<{ success: boolean; error?: string; exception?: CalendarException }> {
  if (!input.exception_date) {
    return { success: false, error: "Data non valida." };
  }

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("calendar_exceptions")
    .upsert(
      {
        exception_date: input.exception_date,
        reason: input.reason || "Chiusura straordinaria / Ferie",
        is_closed: input.is_closed ?? true,
      },
      { onConflict: "exception_date" }
    )
    .select()
    .single();

  if (error) {
    console.error("Errore addCalendarException:", error);
    return { success: false, error: error.message };
  }

  return { success: true, exception: data };
}

/**
 * Aggiunge un periodo continuativo di ferie / chiusura straordinaria (intervallo date).
 * Calcola tutte le date tra startDate ed endDate e le registra con 1 operazione batch.
 */
export async function addVacationPeriod(input: {
  startDate: string;
  endDate: string;
  reason: string;
}): Promise<{ success: boolean; count?: number; error?: string }> {
  if (!input.startDate || !input.endDate) {
    return { success: false, error: "Data di inizio e data di fine sono obbligatorie." };
  }

  const start = new Date(`${input.startDate}T00:00:00`);
  const end = new Date(`${input.endDate}T00:00:00`);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { success: false, error: "Formato date non valido." };
  }

  if (end < start) {
    return { success: false, error: "La data di fine non può essere precedente alla data di inizio." };
  }

  const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  if (diffDays > 90) {
    return { success: false, error: "L'intervallo massimo consentito per singola registrazione è di 90 giorni." };
  }

  const rows: { exception_date: string; reason: string; is_closed: boolean }[] = [];
  const curr = new Date(start);

  while (curr <= end) {
    const yyyy = curr.getFullYear();
    const mm = String(curr.getMonth() + 1).padStart(2, "0");
    const dd = String(curr.getDate()).padStart(2, "0");
    rows.push({
      exception_date: `${yyyy}-${mm}-${dd}`,
      reason: input.reason?.trim() || "Ferie Salone",
      is_closed: true,
    });
    curr.setDate(curr.getDate() + 1);
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("calendar_exceptions")
    .upsert(rows, { onConflict: "exception_date" });

  if (error) {
    console.error("Errore addVacationPeriod:", error);
    return { success: false, error: error.message };
  }

  return { success: true, count: rows.length };
}

/**
 * Rimuove un intero intervallo continuativo di chiusura straordinaria o ferie.
 */
export async function removeVacationRange(input: {
  startDate: string;
  endDate: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!input.startDate || !input.endDate) {
    return { success: false, error: "Date non valide per la rimozione." };
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("calendar_exceptions")
    .delete()
    .gte("exception_date", input.startDate)
    .lte("exception_date", input.endDate);

  if (error) {
    console.error("Errore removeVacationRange:", error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Rimuove un giorno di chiusura straordinaria ripristinando il normale orario di lavoro.
 */
export async function removeCalendarException(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("calendar_exceptions")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Errore removeCalendarException:", error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Recupera o crea un profilo utente valido per le operazioni interne del barbiere (blocchi slot, note, ecc.)
 */
async function getAdminProfileUserId(adminClient: ReturnType<typeof createAdminClient>): Promise<string> {
  // 1. Cerca un profilo con ruolo admin
  const { data: adminProf } = await adminClient
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();

  if (adminProf?.id) return adminProf.id;

  // 2. Cerca un profilo di sistema per il salone
  const { data: salonProf } = await adminClient
    .from("profiles")
    .select("id")
    .eq("phone", "BLOCCATO")
    .limit(1)
    .maybeSingle();

  if (salonProf?.id) return salonProf.id;

  // 3. Cerca un qualsiasi profilo esistente
  const { data: anyProf } = await adminClient
    .from("profiles")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (anyProf?.id) return anyProf.id;

  // 4. Se la tabella è vuota, crea l'utente staff tramite Supabase Auth Admin
  const { data: authUser } = await adminClient.auth.admin.createUser({
    email: `staff_${Date.now()}@smartbarber.local`,
    email_confirm: true,
    user_metadata: {
      full_name: "Barbershop Roberto Baccaro",
      phone: "BLOCCATO",
      role: "admin",
    },
  });

  if (authUser?.user?.id) {
    return authUser.user.id;
  }

  throw new Error("Impossibile associare un profilo utente al blocco slot.");
}

/**
 * Blocca istantaneamente uno slot con 1 click (Pausa / Impegno personale).
 * Rende lo slot immediatamente non disponibile sia per la chat AI che per il calendario dei clienti.
 */
export async function quickBlockSlot(input: {
  date: string; // "YYYY-MM-DD"
  time: string; // "HH:mm"
  durationMinutes?: number;
  reason?: string;
}): Promise<{ success: boolean; appointmentId?: string; error?: string }> {
  const adminClient = createAdminClient();
  const duration = input.durationMinutes || 30;
  const startTime = `${input.time.substring(0, 5)}:00`;

  let endTime = "19:30:00";
  try {
    const parsed = parse(`${input.date} ${input.time.substring(0, 5)}`, "yyyy-MM-dd HH:mm", new Date());
    const endParsed = addMinutes(parsed, duration);
    endTime = `${format(endParsed, "HH:mm")}:00`;
  } catch {}

  const reasonLabel = input.reason ? `⛔ Blocco: ${input.reason}` : "⛔ Blocco Barbiere / Pausa";

  try {
    const userId = await getAdminProfileUserId(adminClient);

    const { data, error } = await adminClient
      .from("appointments")
      .insert({
        user_id: userId,
        customer_name: reasonLabel,
        customer_phone: "BLOCCATO",
        appointment_date: input.date,
        start_time: startTime,
        end_time: endTime,
        duration_minutes: duration,
        status: "confirmed",
        payment_status: "paid",
        payment_method: "in_person",
        price_cents: 0,
        notes: input.reason || "Orario bloccato dal barbiere (pausa o impegno personale)",
      })
      .select("id")
      .single();

    if (error) {
      console.error("Errore quickBlockSlot:", error);
      return { success: false, error: error.message };
    }

    return { success: true, appointmentId: data.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Errore durante il blocco dello slot";
    console.error("Eccezione quickBlockSlot:", err);
    return { success: false, error: message };
  }
}

/**
 * Sblocca un orario precedentemente bloccato, riaprendolo istantaneamente per i clienti.
 */
export async function quickUnblockSlot(
  appointmentId: string
): Promise<{ success: boolean; error?: string }> {
  return cancelAppointmentByAdmin(appointmentId);
}

/**
 * Inserimento rapido per prenotazioni telefoniche o clienti di passaggio al banco (senza autenticazione OTP).
 */
export async function quickManualBooking(input: {
  date: string;
  time: string;
  customerName: string;
  customerPhone?: string;
  serviceName?: string;
  priceCents?: number;
  durationMinutes?: number;
  notes?: string;
}): Promise<{ success: boolean; appointmentId?: string; error?: string }> {
  if (!input.customerName || input.customerName.trim().length === 0) {
    return { success: false, error: "Inserisci il nome del cliente." };
  }

  const adminClient = createAdminClient();
  const duration = input.durationMinutes || 30;
  const startTime = `${input.time.substring(0, 5)}:00`;

  let endTime = "19:30:00";
  try {
    const parsed = parse(`${input.date} ${input.time.substring(0, 5)}`, "yyyy-MM-dd HH:mm", new Date());
    const endParsed = addMinutes(parsed, duration);
    endTime = `${format(endParsed, "HH:mm")}:00`;
  } catch {}

  const cleanPhone = input.customerPhone?.trim() || "Al banco / Telefono";
  const digitsOnly = cleanPhone.replace(/\D/g, "");

  try {
    let targetUserId = "";

    if (digitsOnly.length >= 6) {
      const { data: existingProfile } = await adminClient
        .from("profiles")
        .select("id")
        .eq("phone", cleanPhone)
        .maybeSingle();

      if (existingProfile?.id) {
        targetUserId = existingProfile.id;
      } else {
        const guestEmail = `guest_${digitsOnly}@smartbarber.local`;
        const { data: authUser } = await adminClient.auth.admin.createUser({
          email: guestEmail,
          email_confirm: true,
          user_metadata: {
            full_name: input.customerName.trim(),
            phone: cleanPhone,
            role: "client",
          },
        });
        if (authUser?.user?.id) {
          targetUserId = authUser.user.id;
        }
      }
    }

    if (!targetUserId) {
      targetUserId = await getAdminProfileUserId(adminClient);
    }

    const { data, error } = await adminClient
      .from("appointments")
      .insert({
        user_id: targetUserId,
        customer_name: input.customerName.trim(),
        customer_phone: cleanPhone,
        appointment_date: input.date,
        start_time: startTime,
        end_time: endTime,
        duration_minutes: duration,
        status: "confirmed",
        payment_status: "unpaid",
        payment_method: "in_person",
        price_cents: input.priceCents || 1800,
        notes: input.notes
          ? `[Manuale] ${input.notes}`
          : `[Prenotazione Telefonica / Banco] Trattamento: ${input.serviceName || "Taglio Capelli"}`,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Errore quickManualBooking:", error);
      return { success: false, error: error.message };
    }

    return { success: true, appointmentId: data.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Errore durante la prenotazione manuale";
    console.error("Eccezione quickManualBooking:", err);
    return { success: false, error: message };
  }
}

/**
 * Verifica se un cliente è bloccato dalle prenotazioni online a causa di 3 o più No-Show (mancate presentazioni senza disdetta).
 */
export async function checkCustomerNoShowStatus(phone: string): Promise<{
  isBlocked: boolean;
  noShowCount: number;
  message?: string;
}> {
  if (!phone || phone.trim().length < 6) {
    return { isBlocked: false, noShowCount: 0 };
  }

  const cleanPhone = phone.trim().replace(/\s+/g, "");
  const digitsOnly = cleanPhone.replace(/\D/g, "");
  const last8 = digitsOnly.slice(-8);

  const adminClient = createAdminClient();

  const { data: noShows, error } = await adminClient
    .from("appointments")
    .select("id, customer_phone")
    .eq("status", "no_show");

  if (error || !noShows) {
    return { isBlocked: false, noShowCount: 0 };
  }

  const matches = noShows.filter((apt) => {
    const aptDigits = (apt.customer_phone || "").replace(/\D/g, "");
    return aptDigits === digitsOnly || (last8.length >= 8 && aptDigits.endsWith(last8));
  });

  const count = matches.length;
  // Soglia configurata: blocco a partire da 3 no-show
  const isBlocked = count >= 3;

  return {
    isBlocked,
    noShowCount: count,
    message: isBlocked
      ? "A causa di 3 precedenti appuntamenti non usufruiti senza disdetta, per la tua prossima prenotazione ti invitiamo a contattare direttamente il salone al telefono o su WhatsApp."
      : undefined,
  };
}

/**
 * Resetta/sana i No-Show di un cliente riabilitando le sue prenotazioni online (azione riservata al barbiere).
 */
export async function resetCustomerNoShows(
  phone: string
): Promise<{ success: boolean; pardonedCount?: number; error?: string }> {
  if (!phone) return { success: false, error: "Numero di cellulare non specificato." };

  const cleanPhone = phone.trim().replace(/\s+/g, "");
  const digitsOnly = cleanPhone.replace(/\D/g, "");
  const last8 = digitsOnly.slice(-8);

  const adminClient = createAdminClient();

  const { data: noShows, error: fetchErr } = await adminClient
    .from("appointments")
    .select("id, customer_phone")
    .eq("status", "no_show");

  if (fetchErr) {
    return { success: false, error: fetchErr.message };
  }

  const toPardon = (noShows || []).filter((apt) => {
    const aptDigits = (apt.customer_phone || "").replace(/\D/g, "");
    return aptDigits === digitsOnly || (last8.length >= 8 && aptDigits.endsWith(last8));
  });

  let count = 0;
  for (const apt of toPardon) {
    await adminClient
      .from("appointments")
      .update({
        status: "cancelled",
        notes: "[No-show sanato/riabilitato dal barbiere]",
        updated_at: new Date().toISOString(),
      })
      .eq("id", apt.id);
    count++;
  }

  return { success: true, pardonedCount: count };
}

