"use server";

import fs from "fs";
import path from "path";

function getSalonContacts() {
  try {
    const filePath = path.join(process.cwd(), "src", "data", "salon_contacts.json");
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch {}
  return { salon_phone: "331 81 76 178", whatsapp_phone: "331 81 76 178" };
}

export interface WhatsAppSendResult {
  success: boolean;
  sentViaApi: boolean;
  simulatedOtp?: string;
  directWhatsAppUrl?: string;
  error?: string;
}

/**
 * Invia il codice di verifica via WhatsApp.
 * - Se configurata la Meta Cloud API (gratis fino a 1.000 msg/mese), invia direttamente tramite API.
 * - In modalità locale/sviluppo, genera il codice con link diretto WhatsApp per test immediato senza costi.
 */
export async function sendWhatsAppOtpMessage(input: {
  phone: string;
  customerName?: string;
  otpCode: string;
}): Promise<WhatsAppSendResult> {
  const { phone, customerName, otpCode } = input;

  // Normalizza il numero (rimuove spazi e trattini)
  let cleanPhone = phone.replace(/\D/g, "");
  // Se non inizia con 39 (Italia) e ha 10 cifre, aggiungi prefisso 39
  if (cleanPhone.length === 10 && !cleanPhone.startsWith("39")) {
    cleanPhone = `39${cleanPhone}`;
  }

  const contacts = getSalonContacts();
  const salonWhatsApp = contacts.whatsapp_phone?.replace(/\D/g, "") || "393471234567";

  const messageText =
    `*BARBERSHOP ROBERTO BACCARO - Dal 1958*\n` +
    `Codice di Verifica\n\n` +
    `Ciao ${customerName || "Cliente"},\n` +
    `ecco il tuo codice per accedere e prenotare:\n\n` +
    `*${otpCode}*\n\n` +
    `⏱️ Valido per 5 minuti.`;

  const apiToken = process.env.WHATSAPP_CLOUD_API_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  let sentViaApi = false;

  // 1. Invio tramite Meta Cloud API se configurata in .env.local
  if (apiToken && phoneId) {
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: cleanPhone,
          type: "text",
          text: {
            preview_url: false,
            body: messageText,
          },
        }),
      });

      const json = await res.json();
      if (res.ok && json.messages) {
        sentViaApi = true;
      } else {
        console.warn("Invio WhatsApp API non riuscito, uso fallback diretto:", json);
      }
    } catch (err) {
      console.error("Errore fetch WhatsApp Cloud API:", err);
    }
  }

  // 2. Link diretto WhatsApp (funziona sempre, gratuito, su cellulare e web)
  const encodedText = encodeURIComponent(messageText);
  const directWhatsAppUrl = `https://wa.me/${cleanPhone}?text=${encodedText}`;

  return {
    success: true,
    sentViaApi,
    simulatedOtp: otpCode,
    directWhatsAppUrl,
  };
}

/**
 * Invia una notifica istantanea su WhatsApp al barbiere per ogni nuova prenotazione effettuata online o via AI.
 */
export async function sendWhatsAppAdminAlert(details: {
  customerName: string;
  customerPhone: string;
  dateStr: string;
  timeStr: string;
  serviceName?: string;
  priceEur?: string;
  paymentMethod?: string;
}): Promise<{ success: boolean; sentViaApi?: boolean }> {
  const contacts = getSalonContacts();
  let barberPhone = contacts.whatsapp_phone?.replace(/\D/g, "") || "";
  if (!barberPhone) return { success: false };

  if (barberPhone.length === 10 && !barberPhone.startsWith("39")) {
    barberPhone = `39${barberPhone}`;
  }

  const messageText = `💈 *NUOVA PRENOTAZIONE - Barbershop Roberto Baccaro*\n\n👤 Cliente: *${details.customerName}*\n📞 Tel: *${details.customerPhone}*\n📅 Data: *${details.dateStr}*\n⏰ Ore: *${details.timeStr}*\n✂️ Trattamento: *${details.serviceName || "Taglio Capelli"}* ${details.priceEur ? `(€${details.priceEur})` : ""}\n💳 Pagamento: *${details.paymentMethod === "in_app" ? "Pagato in App" : "Paga in Salone"}*\n\nL'agenda e la disponibilità sono state aggiornate automaticamente.`;

  const apiToken = process.env.WHATSAPP_CLOUD_API_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (apiToken && phoneId) {
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: barberPhone,
          type: "text",
          text: {
            preview_url: false,
            body: messageText,
          },
        }),
      });

      const json = await res.json();
      if (res.ok && json.messages) {
        return { success: true, sentViaApi: true };
      }
    } catch (e) {
      console.warn("Invio notifica WhatsApp admin non riuscito:", e);
    }
  }

  return { success: true, sentViaApi: false };
}

/**
 * Invia notifica urgente WhatsApp al barbiere quando un cliente ha espresso l'intenzione
 * di disdire o spostare l'appuntamento con preavviso insufficiente (sotto soglia).
 */
export async function sendWhatsAppCancellationIntentAlert(details: {
  customerName: string;
  customerPhone: string;
  dateStr: string;
  timeStr: string;
  hoursRemaining?: number;
  minCancellationHours: number;
  reason?: string;
}): Promise<{ success: boolean; sentViaApi?: boolean }> {
  const contacts = getSalonContacts();
  let barberPhone = contacts.whatsapp_phone?.replace(/\D/g, "") || "";
  if (!barberPhone) return { success: false };

  if (barberPhone.length === 10 && !barberPhone.startsWith("39")) {
    barberPhone = `39${barberPhone}`;
  }

  const messageText = `🚨 *RICHIESTA DISDETTA CON POCO PREAVVISO - Barbershop Roberto Baccaro*\n\n` +
    `👤 Cliente: *${details.customerName}*\n` +
    `📞 Tel: *${details.customerPhone}*\n` +
    `📅 Appuntamento: *${details.dateStr}* ore *${details.timeStr}*\n` +
    `⚠️ Mancano circa *${details.hoursRemaining !== undefined ? details.hoursRemaining : "< " + details.minCancellationHours} ore* all'appuntamento.\n\n` +
    `Il cliente ha tentato di disdire online con meno delle ${details.minCancellationHours} ore di preavviso richieste.\n` +
    `${details.reason ? `Motivo indicato: "${details.reason}"\n` : ""}` +
    `👉 L'appuntamento NON è stato liberato automaticamente per consentirti di gestire la poltrona. Puoi contattare subito il cliente.`;

  const apiToken = process.env.WHATSAPP_CLOUD_API_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (apiToken && phoneId) {
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: barberPhone,
          type: "text",
          text: {
            preview_url: false,
            body: messageText,
          },
        }),
      });

      const json = await res.json();
      if (res.ok && json.messages) {
        return { success: true, sentViaApi: true };
      }
    } catch (e) {
      console.warn("Invio notifica WhatsApp alert disdetta non riuscito:", e);
    }
  }

  return { success: true, sentViaApi: false };
}

