"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { initOrUpdateLiveChatSession } from "@/app/actions/live-chat";

export interface HandoffStatus {
  aiPaused: boolean;
  aiPausedAt: string | null;
  timeoutExpired?: boolean;
}

const isValidUuid = (str?: string | null): boolean =>
  Boolean(str && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str));

/**
 * Attiva la richiesta di assistenza con operatore umano:
 * - Genera un urgent_alert di tipo 'human_support_request' per far suonare l'allarme in cassa
 * - Se è presente un profilo cliente valido, imposta ai_paused = true nella tabella conversations
 */
export async function requestHumanOperator(
  userId?: string,
  customerName?: string,
  userMessage?: string,
  customerPhone?: string
): Promise<{ success: boolean; error?: string }> {
  const adminClient = createAdminClient();
  const now = new Date().toISOString();

  let targetUserId: string | null = isValidUuid(userId) ? userId! : null;

  // Se l'ID non è un UUID valido, cerchiamo il profilo tramite il numero di telefono
  if (!targetUserId && customerPhone) {
    const { data: p } = await adminClient
      .from("profiles")
      .select("id")
      .eq("phone", customerPhone.trim())
      .maybeSingle();
    if (p?.id) {
      targetUserId = p.id;
    }
  }

  // 1. Crea allarme urgente per il barbiere (Realtime con allarme acustico in cassa)
  const clientLabel = customerName || "Un cliente";
  const phoneLabel = customerPhone ? ` (Tel: ${customerPhone})` : "";
  const alertTitle = `Richiesta Barbiere da ${clientLabel}`;
  const alertMsg = `${clientLabel}${phoneLabel} desidera parlare direttamente con te in salone.${
    userMessage ? ` Messaggio: "${userMessage}"` : ""
  }`;

  await adminClient.from("urgent_alerts").insert({
    user_id: targetUserId || undefined,
    type: "human_support_request",
    title: alertTitle,
    message: alertMsg,
    status: "pending",
  });

  // 1b. Inizializza la sessione di Live Chat condivisa
  const sessionId = customerPhone?.replace(/\D/g, "") || targetUserId || "live_client";
  try {
    await initOrUpdateLiveChatSession({
      sessionId,
      clientName: clientLabel,
      clientPhone: customerPhone?.trim() || "",
      handoffRequested: true,
    });
  } catch (e) {
    console.warn("Errore initOrUpdateLiveChatSession:", e);
  }

  // 2. Se abbiamo un profilo valido, aggiorna conversations per mettere in pausa l'AI
  if (targetUserId) {
    try {
      await adminClient
        .from("conversations")
        .upsert({
          user_id: targetUserId,
          ai_paused: true,
          ai_paused_at: now,
          updated_at: now,
        });
    } catch (e) {
      console.warn("Errore aggiornamento conversations:", e);
    }
  }

  return { success: true };
}

/**
 * Verifica lo stato di pausa dell'AI e gestisce il Timeout Automatico (Human-in-the-Loop):
 * Se ai_paused è true ma sono trascorsi più di N secondi (default 180s = 3 min) dall'inizio
 * della pausa e il barbiere non ha ancora risposto, l'AI viene automaticamente riattivata.
 */
export async function checkAndResolveHandoffTimeout(
  userId: string
): Promise<HandoffStatus> {
  if (!isValidUuid(userId)) {
    return {
      aiPaused: false,
      aiPausedAt: null,
    };
  }

  const adminClient = createAdminClient();
  const supabase = await createClient();

  // Recupera configurazione timeout (default 180s)
  const { data: settings } = await supabase
    .from("business_settings")
    .select("human_handoff_timeout_seconds")
    .limit(1)
    .single();

  const timeoutSeconds = settings?.human_handoff_timeout_seconds ?? 180;

  // Recupera conversazione
  const { data: conversation } = await adminClient
    .from("conversations")
    .select("ai_paused, ai_paused_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!conversation || !conversation.ai_paused || !conversation.ai_paused_at) {
    return {
      aiPaused: false,
      aiPausedAt: null,
    };
  }

  // Calcola se il timeout è scaduto
  const pausedAt = new Date(conversation.ai_paused_at).getTime();
  const now = Date.now();
  const elapsedSeconds = Math.floor((now - pausedAt) / 1000);

  if (elapsedSeconds > timeoutSeconds) {
    // Reset automatico: l'AI riprende il controllo
    await adminClient
      .from("conversations")
      .update({
        ai_paused: false,
        ai_paused_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    return {
      aiPaused: false,
      aiPausedAt: null,
      timeoutExpired: true,
    };
  }

  return {
    aiPaused: true,
    aiPausedAt: conversation.ai_paused_at,
  };
}

/**
 * Annulla la richiesta di operatore umano e riattiva subito l'Assistente Virtuale:
 * - Archivia le allerte urgenti non gestite di tipo 'human_support_request'
 * - Imposta ai_paused = false in conversations
 */
export async function cancelHumanOperatorRequest(
  userId?: string,
  customerPhone?: string
): Promise<{ success: boolean; error?: string }> {
  const adminClient = createAdminClient();

  let targetUserId: string | null = isValidUuid(userId) ? userId! : null;
  if (!targetUserId && customerPhone) {
    const { data: p } = await adminClient
      .from("profiles")
      .select("id")
      .eq("phone", customerPhone.trim())
      .maybeSingle();
    if (p?.id) targetUserId = p.id;
  }

  // 1. Archivia o contrassegna come evasa l'allerta in cassa
  try {
    let alertQuery = adminClient
      .from("urgent_alerts")
      .update({ status: "acknowledged" })
      .eq("type", "human_support_request")
      .eq("status", "pending");

    if (targetUserId) {
      alertQuery = alertQuery.eq("user_id", targetUserId);
    }
    await alertQuery;
  } catch (e) {
    console.warn("Errore archiviazione allerta cancelHumanOperatorRequest:", e);
  }

  // 2. Se conversations era in pausa, riattiviamo l'assistente
  if (targetUserId) {
    try {
      await adminClient
        .from("conversations")
        .update({
          ai_paused: false,
          ai_paused_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", targetUserId);
    } catch (e) {
      console.warn("Errore reset conversations in cancelHumanOperatorRequest:", e);
    }
  }

  return { success: true };
}

