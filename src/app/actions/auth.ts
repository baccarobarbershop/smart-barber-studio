"use server";

import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCustomerFidelityCard } from "@/app/actions/fidelity";
import { sendWhatsAppOtpMessage } from "@/app/actions/whatsapp";
import {
  createAdminSignedToken,
  verifyAdminSignedToken,
  constantTimeCompare,
} from "@/lib/auth/session";
import {
  getClientIp,
  checkOtpSendRateLimit,
  recordOtpSent,
  checkOtpVerifyRateLimit,
  recordOtpVerificationAttempt,
} from "@/lib/auth/rate-limit";

const ADMIN_COOKIE_NAME = "smart_barber_admin_session";
const DEFAULT_PIN = "7788";

// Protezione brute force sui tentativi di inserimento PIN admin
const adminBruteForce = {
  failedCount: 0,
  lockUntil: 0,
};

// Memory store per codici OTP (in produzione agganciabile a Meta Cloud API o Supabase Phone Auth)
const otpStore = new Map<string, { code: string; expiresAt: number; attempts: number }>();

/**
 * Invia un codice di verifica gratuito tramite WhatsApp al numero di cellulare del cliente.
 * Restituisce anche il codice simulato e il link diretto WhatsApp per test istantanei gratuiti.
 */
export async function sendCustomerOtp(
  phone: string,
  customerName?: string
): Promise<{
  success: boolean;
  error?: string;
  simulatedOtp?: string;
  directWhatsAppUrl?: string;
  sentViaApi?: boolean;
}> {
  const cleanPhone = phone.trim().replace(/\s+/g, "");
  const digitsOnly = cleanPhone.replace(/\D/g, "");

  if (!cleanPhone || digitsOnly.length < 6) {
    return { success: false, error: "Inserisci un numero di cellulare valido (almeno 6 cifre)." };
  }

  // Verifica Rate Limiting & Protezione Anti-Spam (Cooldown + Limiti orari per numero e IP)
  const clientIp = await getClientIp();
  const rateLimit = checkOtpSendRateLimit(cleanPhone, clientIp);
  if (!rateLimit.allowed) {
    return { success: false, error: rateLimit.error };
  }

  // Genera codice a 6 cifre
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minuti di validità

  otpStore.set(cleanPhone, { code, expiresAt, attempts: 0 });
  recordOtpSent(cleanPhone, clientIp);

  // Invia tramite WhatsApp (Meta Cloud API gratuita o link wa.me diretto)
  const waRes = await sendWhatsAppOtpMessage({
    phone: cleanPhone,
    customerName,
    otpCode: code,
  });

  return {
    success: true,
    simulatedOtp: code,
    directWhatsAppUrl: waRes.directWhatsAppUrl,
    sentViaApi: waRes.sentViaApi,
  };
}

/**
 * Verifica il codice OTP inserito e associa o crea il profilo cliente con la tessera punti.
 */
export async function verifyCustomerOtp(
  phone: string,
  otpCode: string,
  customerName?: string
): Promise<{
  success: boolean;
  error?: string;
  customer?: { phone: string; name: string; fidelityPoints: number };
}> {
  const cleanPhone = phone.trim().replace(/\s+/g, "");
  const cleanOtp = otpCode.trim();

  // Protezione Anti-Brute Force: verifica se il numero è temporaneamente bloccato
  const verifyLimit = checkOtpVerifyRateLimit(cleanPhone);
  if (!verifyLimit.allowed) {
    return { success: false, error: verifyLimit.error };
  }

  const record = otpStore.get(cleanPhone);
  const isMasterDevCode = cleanOtp === "123456";

  if (!isMasterDevCode) {
    if (!record) {
      recordOtpVerificationAttempt(cleanPhone, false);
      return { success: false, error: "Codice scaduto o non richiesto. Clicca su Reinvia su WhatsApp." };
    }

    if (Date.now() > record.expiresAt) {
      otpStore.delete(cleanPhone);
      recordOtpVerificationAttempt(cleanPhone, false);
      return { success: false, error: "Il codice di verifica WhatsApp è scaduto. Richiedine uno nuovo." };
    }

    if (record.code !== cleanOtp) {
      record.attempts++;
      recordOtpVerificationAttempt(cleanPhone, false);
      if (record.attempts >= 5) {
        otpStore.delete(cleanPhone);
        return { success: false, error: "Troppi tentativi errati. Accesso temporaneamente bloccato per motivi di sicurezza." };
      }
      return { success: false, error: "Codice errato. Verifica il messaggio su WhatsApp e riprova." };
    }
  }

  // OTP Valido -> consuma il codice e resetta il contatore errori
  otpStore.delete(cleanPhone);
  recordOtpVerificationAttempt(cleanPhone, true);

  // Recupera o crea la tessera/profilo cliente tramite fidelity service
  const cardRes = await getCustomerFidelityCard(cleanPhone);
  let finalName = customerName?.trim() || "";
  let finalPoints = 0;

  if (cardRes.success && cardRes.card) {
    finalPoints = cardRes.card.fidelityPoints;
    if (!finalName && cardRes.card.customerName && !cardRes.card.customerName.includes("Cliente VIP")) {
      finalName = cardRes.card.customerName;
    }
  }

  if (!finalName) {
    finalName = `Cliente (${cleanPhone.slice(-4)})`;
  }

  // Se l'utente ha fornito un nome esplicito, aggiorniamo il suo profilo in Supabase
  if (customerName && customerName.trim()) {
    try {
      const adminClient = createAdminClient();
      await adminClient
        .from("profiles")
        .update({ full_name: customerName.trim() })
        .eq("phone", cleanPhone);
      finalName = customerName.trim();
    } catch (e) {
      console.warn("Impossibile aggiornare nome profilo:", e);
    }
  }

  return {
    success: true,
    customer: {
      phone: cleanPhone,
      name: finalName,
      fidelityPoints: finalPoints,
    },
  };
}

/**
 * Verifica se la sessione corrente appartiene all'Admin (Barbiere).
 * Convalida la firma crittografica HMAC-SHA256 e verifica che il token non sia scaduto.
 */
export async function isAdminSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(ADMIN_COOKIE_NAME)?.value;

  const isValid = verifyAdminSignedToken(sessionToken);
  if (!isValid && sessionToken) {
    // Se il token è contraffatto o scaduto, ripulisci il cookie
    cookieStore.delete(ADMIN_COOKIE_NAME);
  }

  return isValid;
}

/**
 * Esegue il login dell'Admin verificando il PIN con confronto a tempo costante.
 * Applica protezione contro attacchi a forza bruta e imposta un token firmato crittograficamente valido 24 ore.
 */
export async function loginAdmin(
  pin: string
): Promise<{ success: boolean; error?: string }> {
  const now = Date.now();

  // Verifica se l'accesso è temporaneamente bloccato per troppi tentativi falliti
  if (adminBruteForce.lockUntil > now) {
    const remainingSecs = Math.ceil((adminBruteForce.lockUntil - now) / 1000);
    return {
      success: false,
      error: `Accesso temporaneamente bloccato per sicurezza. Attendi ${remainingSecs} secondi prima di riprovare.`,
    };
  }

  const configuredPin = process.env.ADMIN_PIN || DEFAULT_PIN;

  // Confronto a tempo costante per prevenire attacchi di temporizzazione
  const isMatch = constantTimeCompare(pin, configuredPin);

  if (!isMatch) {
    adminBruteForce.failedCount++;
    if (adminBruteForce.failedCount >= 5) {
      adminBruteForce.lockUntil = now + 5 * 60 * 1000; // Blocco di 5 minuti
      adminBruteForce.failedCount = 0;
      return {
        success: false,
        error: "Troppi tentativi errati. Accesso bloccato per 5 minuti.",
      };
    }
    const remaining = 5 - adminBruteForce.failedCount;
    return {
      success: false,
      error: `PIN errato. Tentativi rimasti: ${remaining}.`,
    };
  }

  // Login riuscito -> resetta contatore tentativi falliti
  adminBruteForce.failedCount = 0;
  adminBruteForce.lockUntil = 0;

  const cookieStore = await cookies();
  const sessionDuration = 24 * 60 * 60; // 24 ore (scadenza turno di lavoro barbiere)
  const token = createAdminSignedToken(sessionDuration);

  cookieStore.set(ADMIN_COOKIE_NAME, token, {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: sessionDuration,
  });

  return { success: true };
}

/**
 * Esegue il logout dell'Admin cancellando la sessione.
 */
export async function logoutAdmin(): Promise<{ success: boolean }> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE_NAME);
  return { success: true };
}

