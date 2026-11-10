"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { setBarberActiveStatus } from "@/app/actions/live-chat";
import type { UrgentAlert } from "@/types/database";

export async function fetchPendingAlerts(): Promise<UrgentAlert[]> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("urgent_alerts")
    .select(`
      *,
      profile:profiles!urgent_alerts_user_id_fkey(id, full_name, phone),
      appointment:appointments(id, appointment_date, start_time, end_time, status)
    `)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Errore fetch pending alerts:", error);
    return [];
  }

  return (data as unknown as UrgentAlert[]) || [];
}

export interface AcknowledgeAlertResult {
  success: boolean;
  error?: string;
  alertType?: string;
  customerName?: string;
  customerPhone?: string;
  directWhatsAppUrl?: string;
  chatUrl?: string;
}

export async function acknowledgeAlert(alertId: string): Promise<AcknowledgeAlertResult> {
  const adminClient = createAdminClient();
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  // 1. Recupera l'allerta con i dettagli del profilo cliente prima di archiviarla
  const { data: alert } = await adminClient
    .from("urgent_alerts")
    .select(`
      *,
      profile:profiles!urgent_alerts_user_id_fkey(id, full_name, phone)
    `)
    .eq("id", alertId)
    .single();

  const { error } = await adminClient
    .from("urgent_alerts")
    .update({
      status: "acknowledged",
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: user?.id || null,
    })
    .eq("id", alertId);

  if (error) {
    return { success: false, error: error.message };
  }

  let customerPhone = alert?.profile?.phone || "";
  let customerName = alert?.profile?.full_name || "";

  // Estrazione di fallback dal messaggio e dal titolo se non registrati nel profilo
  if (!customerPhone && alert?.message) {
    const phoneMatch = alert.message.match(/(?:Tel:\s*|\+?39)?([0-9\s-]{8,16})/i);
    if (phoneMatch) {
      customerPhone = phoneMatch[1].trim();
    }
  }

  if (!customerName && alert?.title) {
    const nameMatch = alert.title.match(/da\s+(.+)$/i);
    if (nameMatch) {
      customerName = nameMatch[1].trim();
    }
  }

  const cleanDigits = customerPhone.replace(/\D/g, "");
  let directWhatsAppUrl = "";
  if (cleanDigits.length >= 6) {
    const fullNumber = cleanDigits.startsWith("39") ? cleanDigits : `39${cleanDigits}`;
    const textMsg = encodeURIComponent(
      `*BARBERSHOP ROBERTO BACCARO*\n\nCiao ${customerName || "Gentile Cliente"}, sono Roberto il barbiere! Ho preso in carico la tua richiesta. Dimmi pure come posso aiutarti.`
    );
    directWhatsAppUrl = `https://wa.me/${fullNumber}?text=${textMsg}`;
  }

  const sessionId = cleanDigits || alert?.user_id || "live_client";

  if (alert?.type === "human_support_request") {
    try {
      await setBarberActiveStatus(sessionId, true);
    } catch (e) {
      console.warn("Errore setBarberActiveStatus:", e);
    }
  }

  const chatUrl = `/chat?role=barber&sessionId=${encodeURIComponent(sessionId)}&clientPhone=${encodeURIComponent(customerPhone)}&clientName=${encodeURIComponent(customerName)}`;

  return {
    success: true,
    alertType: alert?.type,
    customerName,
    customerPhone,
    directWhatsAppUrl,
    chatUrl,
  };
}

