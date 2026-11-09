"use server";

import { normalizePhoneDigits } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";

export interface LiveChatMessage {
  id: string;
  senderRole: "client" | "barber" | "assistant" | "system";
  senderName: string;
  content: string;
  timestamp: string;
}

export interface LiveChatSession {
  sessionId: string;
  clientName: string;
  clientPhone: string;
  isBarberActive: boolean;
  handoffRequested: boolean;
  handoffRequestedAt?: string;
  barberJoinedAt?: string;
  messages: LiveChatMessage[];
  updatedAt: string;
}

const SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

async function readAllSessions(): Promise<Record<string, LiveChatSession>> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("business_settings")
      .select("daily_schedules")
      .eq("id", SETTINGS_ID)
      .maybeSingle();

    if (data?.daily_schedules && typeof data.daily_schedules === "object") {
      const sched = data.daily_schedules as Record<string, unknown>;
      if (sched._live_chat_sessions && typeof sched._live_chat_sessions === "object") {
        return sched._live_chat_sessions as Record<string, LiveChatSession>;
      }
    }
  } catch (err) {
    console.error("Errore lettura live chat da Supabase:", err);
  }
  return {};
}

async function writeAllSessions(sessions: Record<string, LiveChatSession>): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("business_settings")
      .select("daily_schedules")
      .eq("id", SETTINGS_ID)
      .maybeSingle();

    const currentSched =
      data?.daily_schedules && typeof data.daily_schedules === "object"
        ? (data.daily_schedules as Record<string, unknown>)
        : {};

    const updatedSched = {
      ...currentSched,
      _live_chat_sessions: sessions,
    };

    await admin
      .from("business_settings")
      .update({ daily_schedules: updatedSched })
      .eq("id", SETTINGS_ID);
  } catch (err) {
    console.error("Errore salvataggio live chat su Supabase:", err);
  }
}

/**
 * Recupera o inizializza la sessione di chat live per un cliente.
 */
export async function getLiveChatSession(sessionId: string): Promise<LiveChatSession | null> {
  if (!sessionId) return null;
  const sessions = await readAllSessions();
  const normalized = normalizePhoneDigits(sessionId);
  const session = sessions[sessionId] || (normalized ? sessions[normalized] : null);
  if (!session) return null;

  // Auto-chiusura automatica se la sessione con il barbiere è inattiva da più di 15 minuti
  if (session.isBarberActive && session.updatedAt) {
    const elapsedMinutes = (Date.now() - new Date(session.updatedAt).getTime()) / (1000 * 60);
    if (elapsedMinutes > 15) {
      session.isBarberActive = false;
      session.handoffRequested = false;
      await writeAllSessions(sessions);
    }
  }

  return session;
}

/**
 * Inizializza o aggiorna i metadati della sessione di chat (quando il cliente richiede il barbiere).
 */
export async function initOrUpdateLiveChatSession(input: {
  sessionId: string;
  clientName?: string;
  clientPhone?: string;
  initialMessages?: { role: string; content: string }[];
  handoffRequested?: boolean;
}): Promise<LiveChatSession> {
  const { sessionId, clientName, clientPhone, initialMessages, handoffRequested } = input;
  const sessions = await readAllSessions();

  const now = new Date().toISOString();
  let session = sessions[sessionId];

  if (!session) {
    session = {
      sessionId,
      clientName: clientName || "Cliente",
      clientPhone: clientPhone || "",
      isBarberActive: false,
      handoffRequested: Boolean(handoffRequested),
      handoffRequestedAt: handoffRequested ? now : undefined,
      messages: [],
      updatedAt: now,
    };
  } else {
    if (clientName) session.clientName = clientName;
    if (clientPhone) session.clientPhone = clientPhone;
    if (handoffRequested !== undefined) {
      session.handoffRequested = handoffRequested;
      if (handoffRequested) session.handoffRequestedAt = now;
    }
    session.updatedAt = now;
  }

  // Se sono forniti messaggi iniziali e la cronologia è vuota, popolala
  if (initialMessages && initialMessages.length > 0 && session.messages.length === 0) {
    session.messages = initialMessages.map((m, idx) => ({
      id: `${Date.now()}_${idx}`,
      senderRole: m.role === "user" ? "client" : "assistant",
      senderName: m.role === "user" ? session.clientName : "Smart Barber AI",
      content: m.content,
      timestamp: now,
    }));
  }

  sessions[sessionId] = session;
  await writeAllSessions(sessions);
  return session;
}

/**
 * Invia un messaggio nella chat live (sia da parte del cliente che del barbiere).
 */
export async function sendLiveChatMessage(input: {
  sessionId: string;
  senderRole: "client" | "barber" | "assistant" | "system";
  senderName: string;
  content: string;
}): Promise<{ success: boolean; message?: LiveChatMessage; session?: LiveChatSession; error?: string }> {
  const { sessionId, senderRole, senderName, content } = input;
  if (!sessionId || !content.trim()) {
    return { success: false, error: "Dati mancanti" };
  }

  const sessions = await readAllSessions();
  const normalizedKey = normalizePhoneDigits(sessionId) || sessionId;
  let targetKey = sessionId;
  let session = sessions[sessionId];
  if (!session && sessions[normalizedKey]) {
    session = sessions[normalizedKey];
    targetKey = normalizedKey;
  }

  const now = new Date().toISOString();

  if (!session) {
    session = {
      sessionId: targetKey,
      clientName: senderRole === "client" ? senderName : "Cliente",
      clientPhone: "",
      isBarberActive: senderRole === "barber",
      handoffRequested: false,
      messages: [],
      updatedAt: now,
    };
  }

  const newMsg: LiveChatMessage = {
    id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    senderRole,
    senderName,
    content: content.trim(),
    timestamp: now,
  };

  session.messages.push(newMsg);
  session.updatedAt = now;

  if (senderRole === "barber") {
    session.isBarberActive = true;
    session.barberJoinedAt = now;
  }

  sessions[targetKey] = session;
  await writeAllSessions(sessions);

  return { success: true, message: newMsg, session };
}

/**
 * Imposta lo stato di presa in carico del barbiere (attivo / rilasciato all'AI).
 */
export async function setBarberActiveStatus(
  sessionId: string,
  isActive: boolean
): Promise<{ success: boolean; session?: LiveChatSession; error?: string }> {
  const sessions = await readAllSessions();
  const normalizedKey = normalizePhoneDigits(sessionId) || sessionId;
  let targetKey = sessionId;
  let session = sessions[sessionId];
  if (!session && sessions[normalizedKey]) {
    session = sessions[normalizedKey];
    targetKey = normalizedKey;
  }
  if (!session) {
    return { success: false, error: "Sessione non trovata" };
  }

  const now = new Date().toISOString();
  session.isBarberActive = isActive;
  if (isActive) {
    session.barberJoinedAt = now;
    session.messages.push({
      id: `sys_${Date.now()}`,
      senderRole: "system",
      senderName: "Sistema",
      content: `💈 Il Barbiere è entrato nella chat ed ha preso in carico la conversazione!`,
      timestamp: now,
    });
  } else {
    session.handoffRequested = false;
    session.messages.push({
      id: `sys_${Date.now()}`,
      senderRole: "system",
      senderName: "Sistema",
      content: `L'Assistente Virtuale è di nuovo attivo e a tua disposizione.`,
      timestamp: now,
    });
  }

  session.updatedAt = now;
  sessions[targetKey] = session;
  await writeAllSessions(sessions);

  return { success: true, session };
}

