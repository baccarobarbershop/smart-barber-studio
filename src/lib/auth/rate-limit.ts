import { headers } from "next/headers";

/**
 * Parametri di configurazione Rate Limiting & Protezione Anti-Abuso
 */
const COOLDOWN_SECONDS = 45; // Secondi minimi di attesa tra due invii successivi allo stesso numero
const PHONE_WINDOW_MS = 5 * 60 * 1000; // Finestra di 5 minuti
const PHONE_MAX_REQUESTS = 3; // Massimo 3 invii ogni 5 minuti per numero
const IP_WINDOW_MS = 10 * 60 * 1000; // Finestra di 10 minuti
const IP_MAX_REQUESTS = 10; // Massimo 10 invii ogni 10 minuti per indirizzo IP

const VERIFY_MAX_FAILED = 5; // Massimo 5 tentativi di verifica errati
const VERIFY_LOCKOUT_MS = 5 * 60 * 1000; // 5 minuti di blocco dopo troppi tentativi errati

// In-memory tracking stores
const phoneSendTimestamps = new Map<string, number[]>();
const ipSendTimestamps = new Map<string, number[]>();
const verificationAttempts = new Map<string, { failedCount: number; lockedUntil: number }>();

/**
 * Estrae l'indirizzo IP del client dai request headers in ambiente Next.js
 */
export async function getClientIp(): Promise<string> {
  try {
    const headerList = await headers();
    const forwarded = headerList.get("x-forwarded-for");
    if (forwarded) {
      return forwarded.split(",")[0].trim();
    }
    const realIp = headerList.get("x-real-ip");
    if (realIp) {
      return realIp.trim();
    }
  } catch {
    // Fuori dal contesto request
  }
  return "127.0.0.1";
}

/**
 * Verifica se l'invio di un nuovo codice OTP è consentito o se deve essere limitato.
 */
export function checkOtpSendRateLimit(
  phone: string,
  ip: string
): { allowed: boolean; error?: string; retryAfterSeconds?: number } {
  const now = Date.now();
  const cleanPhone = phone.replace(/\D/g, "");

  // 1. Verifica Cooldown immediato sul numero di telefono (anti doppio-click / spam rapido)
  const phoneHistory = (phoneSendTimestamps.get(cleanPhone) || []).filter(
    (t) => now - t < PHONE_WINDOW_MS
  );
  phoneSendTimestamps.set(cleanPhone, phoneHistory);

  if (phoneHistory.length > 0) {
    const lastSent = phoneHistory[phoneHistory.length - 1];
    const elapsedSeconds = Math.floor((now - lastSent) / 1000);
    if (elapsedSeconds < COOLDOWN_SECONDS) {
      const waitSeconds = COOLDOWN_SECONDS - elapsedSeconds;
      return {
        allowed: false,
        error: `Codice appena inviato. Attendi ancora ${waitSeconds} ${
          waitSeconds === 1 ? "secondo" : "secondi"
        } prima di richiedere un nuovo codice WhatsApp.`,
        retryAfterSeconds: waitSeconds,
      };
    }
  }

  // 2. Verifica Limite Finestra per Numero (Max 3 invii in 5 minuti)
  if (phoneHistory.length >= PHONE_MAX_REQUESTS) {
    const oldestInWindow = phoneHistory[0];
    const waitMs = PHONE_WINDOW_MS - (now - oldestInWindow);
    const waitMinutes = Math.max(1, Math.ceil(waitMs / 60000));
    return {
      allowed: false,
      error: `Hai superato il limite massimo di richieste per questo numero. Riprova tra ${waitMinutes} ${
        waitMinutes === 1 ? "minuto" : "minuti"
      }.`,
      retryAfterSeconds: Math.ceil(waitMs / 1000),
    };
  }

  // 3. Verifica Limite Finestra per Indirizzo IP (Max 10 invii in 10 minuti)
  const ipHistory = (ipSendTimestamps.get(ip) || []).filter(
    (t) => now - t < IP_WINDOW_MS
  );
  ipSendTimestamps.set(ip, ipHistory);

  if (ipHistory.length >= IP_MAX_REQUESTS) {
    return {
      allowed: false,
      error: "Rilevata attività anomala da questa connessione. Attendi qualche minuto prima di riprovare.",
      retryAfterSeconds: 300,
    };
  }

  return { allowed: true };
}

/**
 * Registra un invio OTP effettuato con successo nei contatori
 */
export function recordOtpSent(phone: string, ip: string): void {
  const now = Date.now();
  const cleanPhone = phone.replace(/\D/g, "");

  const pList = phoneSendTimestamps.get(cleanPhone) || [];
  pList.push(now);
  phoneSendTimestamps.set(cleanPhone, pList);

  const ipList = ipSendTimestamps.get(ip) || [];
  ipList.push(now);
  ipSendTimestamps.set(ip, ipList);
}

/**
 * Verifica se il numero è attualmente bloccato per troppi tentativi di verifica errati (Anti-Brute Force).
 */
export function checkOtpVerifyRateLimit(phone: string): { allowed: boolean; error?: string } {
  const now = Date.now();
  const cleanPhone = phone.replace(/\D/g, "");
  const record = verificationAttempts.get(cleanPhone);

  if (record && record.lockedUntil > now) {
    const waitMinutes = Math.max(1, Math.ceil((record.lockedUntil - now) / 60000));
    return {
      allowed: false,
      error: `Accesso temporaneamente bloccato per troppi tentativi errati. Riprova tra ${waitMinutes} ${
        waitMinutes === 1 ? "minuto" : "minuti"
      }.`,
    };
  }

  return { allowed: true };
}

/**
 * Registra l'esito di un tentativo di verifica codice OTP
 */
export function recordOtpVerificationAttempt(phone: string, success: boolean): void {
  const cleanPhone = phone.replace(/\D/g, "");
  const now = Date.now();

  if (success) {
    verificationAttempts.delete(cleanPhone);
    return;
  }

  const existing = verificationAttempts.get(cleanPhone) || { failedCount: 0, lockedUntil: 0 };
  const failedCount = existing.failedCount + 1;
  let lockedUntil = existing.lockedUntil;

  if (failedCount >= VERIFY_MAX_FAILED) {
    lockedUntil = now + VERIFY_LOCKOUT_MS;
  }

  verificationAttempts.set(cleanPhone, { failedCount, lockedUntil });
}

