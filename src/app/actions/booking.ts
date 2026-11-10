"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { addMinutes, format, parse, isBefore, addDays, isAfter } from "date-fns";
import { it } from "date-fns/locale";
import {
  sendWhatsAppAdminAlert,
  sendWhatsAppCancellationIntentAlert,
} from "@/app/actions/whatsapp";
import { checkCustomerNoShowStatus } from "@/app/actions/admin";
import type { PaymentMethod } from "@/types/database";

function formatDateItalianStr(dateStr: string): string {
  try {
    return format(new Date(`${dateStr}T00:00:00`), "d MMMM yyyy", { locale: it });
  } catch {
    return dateStr;
  }
}

export interface BookAppointmentInput {
  date: string; // "YYYY-MM-DD"
  time: string; // "HH:mm"
  customerName: string; // Obbligatorio
  customerPhone: string; // Obbligatorio
  paymentMethod?: PaymentMethod; // 'in_person' | 'in_app'
  notes?: string;
  lookbookImageUrl?: string;
  serviceName?: string;
  priceCents?: number;
}

export interface BookingResult {
  success: boolean;
  appointmentId?: string;
  checkoutUrl?: string; // Se pagamento in app
  error?: string;
}

/**
 * Server Action deterministica per la prenotazione:
 * 1. Convalida NOME e TELEFONO OBBLIGATORI.
 * 2. Verifica che l'orario non sia nel passato.
 * 3. Recupera o crea il profilo cliente (salvando nome e telefono).
 * 4. Inserisce l'appuntamento con vincolo anti-overbooking.
 * 5. Invia notifica in Urgent Alerts per allertare il barbiere in Realtime.
 */
export async function bookAppointment(
  input: BookAppointmentInput
): Promise<BookingResult> {
  const {
    date,
    time,
    customerName,
    customerPhone,
    paymentMethod = "in_person",
    notes,
    lookbookImageUrl,
  } = input;

  // 1. Validazione stretta dei campi obbligatori
  if (!customerName || customerName.trim().length === 0) {
    return {
      success: false,
      error: "Il nome e cognome sono obbligatori per completare la prenotazione.",
    };
  }

  if (!customerPhone || customerPhone.trim().length < 6) {
    return {
      success: false,
      error: "Il numero di telefono è obbligatorio per confermare l'appuntamento e ricevere promemoria.",
    };
  }

  // Verifica Politica Anti No-Show (blocco dopo 3 mancate presentazioni senza disdetta)
  const noShowCheck = await checkCustomerNoShowStatus(customerPhone);
  if (noShowCheck.isBlocked) {
    return {
      success: false,
      error:
        noShowCheck.message ||
        "A causa di 3 precedenti appuntamenti non usufruiti senza disdetta, per la tua prossima prenotazione ti invitiamo a contattare direttamente il salone al telefono o su WhatsApp.",
    };
  }

  if (!date || !time) {
    return {
      success: false,
      error: "Data e ora dell'appuntamento sono obbligatorie.",
    };
  }

  // Verifica non sia nel passato
  const now = new Date();
  const appointmentDateTime = parse(
    `${date} ${time}`,
    "yyyy-MM-dd HH:mm",
    new Date()
  );

  if (isBefore(appointmentDateTime, now)) {
    return {
      success: false,
      error: "Non è possibile prenotare un orario già trascorso.",
    };
  }

  const supabase = await createClient();

  // 2. Recupera impostazioni del salone
  const { data: settings } = await supabase
    .from("business_settings")
    .select("slot_duration_minutes, slot_price_cents, max_advance_booking_days")
    .limit(1)
    .single();

  const maxAdvanceDays = settings?.max_advance_booking_days ?? 14;
  const maxAllowedDate = addDays(new Date(), maxAdvanceDays);
  if (isAfter(appointmentDateTime, maxAllowedDate)) {
    return {
      success: false,
      error: `Le prenotazioni online sono aperte fino a un massimo di ${maxAdvanceDays} giorni in avanti.`,
    };
  }

  const durationMinutes = settings?.slot_duration_minutes ?? 30;
  const priceCents = settings?.slot_price_cents ?? 1800;
  const startTime = `${time}:00`;
  const endTimeDate = addMinutes(appointmentDateTime, durationMinutes);
  const endTime = `${format(endTimeDate, "HH:mm")}:00`;

  const adminClient = createAdminClient();

  // Verifica preventiva anti-overbooking: slot già occupato?
  const { data: conflictingApt } = await adminClient
    .from("appointments")
    .select("id")
    .eq("appointment_date", date)
    .eq("start_time", startTime)
    .neq("status", "cancelled")
    .maybeSingle();

  if (conflictingApt) {
    return {
      success: false,
      error: `Spiacenti, l'orario delle ${time} per il giorno selezionato è già stato prenotato. Scegli un altro orario disponibile.`,
    };
  }

  // 3. Recupera o crea l'utente loggato
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let targetUserId = user?.id;

  if (!targetUserId) {
    // Genera utente guest sicuro collegato al numero di telefono
    const cleanPhone = customerPhone.replace(/\D/g, "");
    const guestEmail = `guest_${cleanPhone || Date.now()}@smartbarber.local`;

    const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
      email: guestEmail,
      email_confirm: true,
      user_metadata: {
        full_name: customerName.trim(),
        phone: customerPhone.trim(),
        role: "client",
      },
    });

    if (authError || !authUser.user) {
      // Se esiste già, possiamo cercare il profilo corrispondente
      const { data: existingProfile } = await adminClient
        .from("profiles")
        .select("id")
        .eq("phone", customerPhone.trim())
        .maybeSingle();

      if (existingProfile) {
        targetUserId = existingProfile.id;
      } else {
        return {
          success: false,
          error: "Impossibile registrare il profilo per la prenotazione: " + (authError?.message || ""),
        };
      }
    } else {
      targetUserId = authUser.user.id;
    }
  } else {
    // Aggiorna nome e telefono se modificati
    await supabase
      .from("profiles")
      .update({
        full_name: customerName.trim(),
        phone: customerPhone.trim(),
      })
      .eq("id", targetUserId);
  }

  // 4. Inserimento deterministico dell'appuntamento con protezione concorrenza
  const { data: appointment, error: insertError } = await adminClient
    .from("appointments")
    .insert({
      user_id: targetUserId,
      customer_name: customerName.trim(),
      customer_phone: customerPhone.trim(),
      appointment_date: date,
      start_time: startTime,
      end_time: endTime,
      duration_minutes: durationMinutes,
      status: "confirmed",
      notes: notes || null,
      lookbook_image_url: lookbookImageUrl || null,
      payment_method: paymentMethod,
      payment_status: paymentMethod === "in_app" ? "paid" : "unpaid",
      price_cents: priceCents,
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return {
        success: false,
        error: "Lo slot selezionato è appena stato prenotato da un altro cliente. Seleziona un altro orario.",
      };
    }

    return {
      success: false,
      error: "Errore durante la registrazione dell'appuntamento: " + insertError.message,
    };
  }

  // 5. Creazione allerta per la Dashboard del barbiere
  await adminClient.from("urgent_alerts").insert({
    appointment_id: appointment.id,
    user_id: targetUserId,
    type: "new_booking",
    title: "Nuova Prenotazione!",
    message: `${customerName.trim()} (${customerPhone.trim()}) ha prenotato per il ${format(
      appointmentDateTime,
      "dd/MM/yyyy"
    )} alle ore ${time}. [${paymentMethod === "in_app" ? "Pagato in App" : "Paga in Salone"}]`,
    status: "pending",
  });

  // Notifica immediata su WhatsApp al barbiere (se configurato)
  try {
    await sendWhatsAppAdminAlert({
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      dateStr: format(appointmentDateTime, "dd/MM/yyyy"),
      timeStr: time,
      serviceName: input.serviceName,
      priceEur: input.priceCents ? (input.priceCents / 100).toFixed(2) : undefined,
      paymentMethod,
    });
  } catch (err) {
    console.warn("Impossibile inviare notifica WhatsApp barbiere:", err);
  }

  return {
    success: true,
    appointmentId: appointment.id,
  };
}

/**
 * Cerca gli appuntamenti attivi legati ad un numero di telefono cliente.
 */
export async function findAppointmentsByPhone(phone: string) {
  if (!phone || phone.trim().length < 6) return [];
  const adminClient = createAdminClient();

  const cleanPhone = phone.trim();
  const today = format(new Date(), "yyyy-MM-dd");

  const { data, error } = await adminClient
    .from("appointments")
    .select("*")
    .eq("customer_phone", cleanPhone)
    .gte("appointment_date", today)
    .eq("status", "confirmed")
    .order("appointment_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    console.error("Errore ricerca appuntamenti per telefono:", error);
    return [];
  }

  return data || [];
}

export interface CancelAppointmentResult {
  success: boolean;
  isBlockedByPolicy?: boolean;
  error?: string;
  salonPhone?: string;
  whatsappPhone?: string;
}

/**
 * Disdetta rapida da parte del cliente con verifica preavviso minimo e invio di allerta urgente sonoro al barbiere.
 */
export async function cancelAppointmentByClient(input: {
  appointmentId: string;
  customerPhone: string;
  reason?: string;
}): Promise<CancelAppointmentResult> {
  const { appointmentId, customerPhone, reason } = input;
  const adminClient = createAdminClient();

  // 1. Verifica appuntamento e corrispondenza numero di telefono
  const { data: apt, error: fetchErr } = await adminClient
    .from("appointments")
    .select("*")
    .eq("id", appointmentId)
    .single();

  if (fetchErr || !apt) {
    return { success: false, error: "Appuntamento non trovato." };
  }

  // Verifica che il numero corrisponda (pulito da spazi/caratteri speciali)
  const normInput = customerPhone.replace(/\D/g, "");
  const normApt = (apt.customer_phone || "").replace(/\D/g, "");
  if (normInput !== normApt && !apt.customer_phone.includes(customerPhone.trim())) {
    return {
      success: false,
      error: "Il numero di telefono inserito non corrisponde a questa prenotazione.",
    };
  }

  // 1b. Recupera le impostazioni per verificare la politica di preavviso minimo
  const { data: settings } = await adminClient
    .from("business_settings")
    .select("min_cancellation_hours, salon_phone, whatsapp_phone")
    .limit(1)
    .single();

  const minCancellationHours = settings?.min_cancellation_hours ?? 2;
  const salonPhone = settings?.salon_phone || "02 1234567";
  const whatsappPhone = settings?.whatsapp_phone || "347 1234567";

  // Calcolo ore mancanti all'appuntamento
  const aptDateTime = parse(
    `${apt.appointment_date} ${apt.start_time.substring(0, 5)}`,
    "yyyy-MM-dd HH:mm",
    new Date()
  );
  const now = new Date();

  // 1c. Protezione Appuntamenti Trascorse: Se l'orario è già superato, l'appuntamento è concluso e freezato
  if (aptDateTime.getTime() <= now.getTime()) {
    return {
      success: false,
      error: "Questo appuntamento è già trascorso ed è concluso (freezato). Non è più possibile disdirlo.",
    };
  }

  const diffMs = aptDateTime.getTime() - now.getTime();
  const hoursRemaining = diffMs / (1000 * 60 * 60);

  // Se mancano meno ore di quelle richieste dal preavviso minimo (e l'appuntamento è futuro)
  if (minCancellationHours > 0 && hoursRemaining < minCancellationHours) {
    const aptTime = apt.start_time.substring(0, 5);

    const aptDateFormatted = format(aptDateTime, "EEEE d MMMM yyyy", { locale: it });

    // NOTIFICA IMMEDIATA URGENTE AL BARBIERE (Sirena sonora in dashboard + Allarme rosso)
    await adminClient.from("urgent_alerts").insert({
      appointment_id: apt.id,
      user_id: apt.user_id,
      type: "urgent_cancellation",
      title: "🚨 RICHIESTA DISDETTA CON POCO PREAVVISO!",
      message: `⚠️ ATTENZIONE: ${apt.customer_name} (${apt.customer_phone}) ha richiesto di DISDIRE l'appuntamento del ${aptDateFormatted} ore ${aptTime} con meno di ${minCancellationHours}h di preavviso! L'appuntamento NON è stato liberato automaticamente per permetterti di gestire la poltrona. ${reason ? `(Motivo indicato: "${reason}")` : ""
        }`,
      status: "pending",
    });

    // Invia notifica immediata WhatsApp al barbiere
    try {
      await sendWhatsAppCancellationIntentAlert({
        customerName: apt.customer_name,
        customerPhone: apt.customer_phone,
        dateStr: format(aptDateTime, "dd/MM/yyyy"),
        timeStr: aptTime,
        hoursRemaining: Math.max(0, Math.round(hoursRemaining * 10) / 10),
        minCancellationHours,
        reason,
      });
    } catch (e) {
      console.warn("Invio alert WhatsApp barbiere non riuscito:", e);
    }

    return {
      success: false,
      isBlockedByPolicy: true,
      error: `Per cancellazioni con meno di ${minCancellationHours} ore di preavviso, la disdetta automatica online è bloccata. Abbiamo comunque già inviato una notifica urgente con allarme al barbiere con la tua richiesta. Ti invitiamo a contattare subito il salone al telefono o su WhatsApp.`,
      salonPhone,
      whatsappPhone,
    };
  }

  // 2. Preavviso sufficiente: Annulla l'appuntamento liberando lo slot
  const { error: updateErr } = await adminClient
    .from("appointments")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", appointmentId);

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  // 3. Spedizione immediata ALLERTA URGENTE ordinaria per la dashboard del barbiere
  const aptTime = apt.start_time.substring(0, 5);
  const aptDateFormatted = format(aptDateTime, "EEEE d MMMM yyyy", { locale: it });
  await adminClient.from("urgent_alerts").insert({
    appointment_id: apt.id,
    user_id: apt.user_id,
    type: "urgent_cancellation",
    title: "🚨 DISDETTA URGENTE CLIENTE!",
    message: `${apt.customer_name} (${apt.customer_phone}) ha DISDETTO l'appuntamento del ${aptDateFormatted} ore ${aptTime}. Lo slot è tornato libero! ${reason ? `(Motivo: "${reason}")` : ""
      }`,
    status: "pending",
  });

  return { success: true };
}

/**
 * Spostamento appuntamento da parte del cliente o dell'AI con verifica anti-overbooking e notifica urgente al barbiere.
 */
export async function rescheduleAppointmentByClient(input: {
  appointmentId: string;
  customerPhone: string;
  newDate: string;
  newTime: string;
}): Promise<CancelAppointmentResult> {
  const { appointmentId, customerPhone, newDate, newTime } = input;
  const adminClient = createAdminClient();

  // 1. Verifica appuntamento esistente
  const { data: apt, error: fetchErr } = await adminClient
    .from("appointments")
    .select("*")
    .eq("id", appointmentId)
    .single();

  if (fetchErr || !apt) {
    return { success: false, error: "Appuntamento non trovato." };
  }

  const normInput = customerPhone.replace(/\D/g, "");
  const normApt = (apt.customer_phone || "").replace(/\D/g, "");
  if (normInput !== normApt && !apt.customer_phone.includes(customerPhone.trim())) {
    return {
      success: false,
      error: "Il numero di telefono inserito non corrisponde a questa prenotazione.",
    };
  }

  // 1b. Verifica preavviso minimo per spostamento
  const { data: settings } = await adminClient
    .from("business_settings")
    .select("min_cancellation_hours, salon_phone, whatsapp_phone")
    .limit(1)
    .single();

  const minCancellationHours = settings?.min_cancellation_hours ?? 2;
  const salonPhone = settings?.salon_phone || "02 1234567";
  const whatsappPhone = settings?.whatsapp_phone || "347 1234567";

  const aptDateTime = parse(
    `${apt.appointment_date} ${apt.start_time.substring(0, 5)}`,
    "yyyy-MM-dd HH:mm",
    new Date()
  );
  const now = new Date();

  // 1c. Protezione Appuntamenti Trascorse: Se l'orario è già superato, l'appuntamento è concluso e freezato
  if (aptDateTime.getTime() <= now.getTime()) {
    return {
      success: false,
      error: "Questo appuntamento è già trascorso ed è concluso (freezato). Non è più possibile spostarlo.",
    };
  }

  const diffMs = aptDateTime.getTime() - now.getTime();
  const hoursRemaining = diffMs / (1000 * 60 * 60);

  if (minCancellationHours > 0 && hoursRemaining < minCancellationHours) {
    const aptTime = apt.start_time.substring(0, 5);

    await adminClient.from("urgent_alerts").insert({
      appointment_id: apt.id,
      user_id: apt.user_id,
      type: "urgent_reschedule",
      title: "🚨 RICHIESTA SPOSTAMENTO CON POCO PREAVVISO!",
      message: `⚠️ ATTENZIONE: ${apt.customer_name} (${apt.customer_phone}) ha richiesto di SPOSTARE l'appuntamento del ${formatDateItalianStr(apt.appointment_date)} ore ${aptTime} al ${formatDateItalianStr(newDate)} ore ${newTime} con meno di ${minCancellationHours}h di preavviso! Lo spostamento non è avvenuto in automatico per permetterti di concordarlo con il cliente.`,
      status: "pending",
    });

    try {
      await sendWhatsAppCancellationIntentAlert({
        customerName: apt.customer_name,
        customerPhone: apt.customer_phone,
        dateStr: format(aptDateTime, "dd/MM/yyyy"),
        timeStr: aptTime,
        hoursRemaining: Math.max(0, Math.round(hoursRemaining * 10) / 10),
        minCancellationHours,
        reason: `Richiesta spostamento al ${newDate} ore ${newTime}`,
      });
    } catch (e) {
      console.warn("Invio alert WhatsApp barbiere non riuscito:", e);
    }

    return {
      success: false,
      isBlockedByPolicy: true,
      error: `Per spostamenti con meno di ${minCancellationHours} ore di preavviso, la modifica automatica online è bloccata. Abbiamo comunque già inviato una notifica urgente al barbiere con la tua richiesta. Ti invitiamo a contattare subito il salone al telefono o su WhatsApp.`,
      salonPhone,
      whatsappPhone,
    };
  }

  const newStartTime = `${newTime}:00`;
  const duration = apt.duration_minutes || 30;
  const newStartDt = parse(`${newDate} ${newTime}`, "yyyy-MM-dd HH:mm", new Date());
  const newEndTime = `${format(addMinutes(newStartDt, duration), "HH:mm")}:00`;

  // 2. Controllo anti-overbooking per il nuovo orario
  const { data: conflicting } = await adminClient
    .from("appointments")
    .select("id")
    .eq("appointment_date", newDate)
    .eq("start_time", newStartTime)
    .neq("status", "cancelled")
    .neq("id", appointmentId)
    .maybeSingle();

  if (conflicting) {
    return {
      success: false,
      error: `L'orario richiesto (${newTime} del ${newDate}) è già occupato. Seleziona un altro slot.`,
    };
  }

  // 3. Salva spostamento
  const oldDate = apt.appointment_date;
  const oldTime = apt.start_time.substring(0, 5);

  const { error: updateErr } = await adminClient
    .from("appointments")
    .update({
      appointment_date: newDate,
      start_time: newStartTime,
      end_time: newEndTime,
      updated_at: new Date().toISOString(),
    })
    .eq("id", appointmentId);

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  // 4. Invia notifica URGENTE al barbiere
  await adminClient.from("urgent_alerts").insert({
    appointment_id: apt.id,
    user_id: apt.user_id,
    type: "urgent_reschedule",
    title: "⚠️ SPOSTAMENTO ORARIO CLIENTE!",
    message: `${apt.customer_name} (${apt.customer_phone}) ha SPOSTATO l'appuntamento dal ${formatDateItalianStr(oldDate)} ore ${oldTime} al NUOVO ORARIO: ${formatDateItalianStr(newDate)} ore ${newTime}!`,
    status: "pending",
  });

  return { success: true };
}
