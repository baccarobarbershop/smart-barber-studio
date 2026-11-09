"use server";

import fs from "fs";
import path from "path";
import { normalizePhoneDigits } from "@/lib/phone";

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

const DATA_FILE = path.join(process.cwd(), "src", "data", "live_conversations.json");

function readAllSessions(): Record<string, LiveChatSession> {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error("Errore lettura live_conversations.json:", err);
  }
  return {};
}

function writeAllSessions(sessions: Record<string, LiveChatSession>) {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(sessions, null, 2), "utf-8");
  } catch (err) {
    console.error("Errore scrittura live_conversations.json:", err);
  }
}

/**
 * Recupera o inizializza la sessione di chat live per un cliente.
 */
export async function getLiveChatSession(sessionId: string): Promise<LiveChatSession | null> {
  if (!sessionId) return null;
  const sessions = readAllSessions();
  if (sessions[sessionId]) return sessions[sessionId];
  const normalized = normalizePhoneDigits(sessionId);
  if (normalized && sessions[normalized]) return sessions[normalized];
  return null;
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
  const sessions = readAllSessions();

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
  writeAllSessions(sessions);
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

  const sessions = readAllSessions();
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
  writeAllSessions(sessions);

  return { success: true, message: newMsg, session };
}

/**
 * Imposta lo stato di presa in carico del barbiere (attivo / rilasciato all'AI).
 */
export async function setBarberActiveStatus(
  sessionId: string,
  isActive: boolean
): Promise<{ success: boolean; session?: LiveChatSession; error?: string }> {
  const sessions = readAllSessions();
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
  writeAllSessions(sessions);

  return { success: true, session };
}

