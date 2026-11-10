/**
 * Utility per la formattazione e generazione di messaggi WhatsApp
 */

export function buildAppointmentWhatsAppUrl(details: {
  customerName: string;
  dateStr: string;
  timeStr: string;
  serviceName?: string;
  priceFormatted?: string;
}): string {
  const text = `💈 *Barbershop Roberto Baccaro - Barberia dal 1958*\n\nGentile ${
    details.customerName
  },\nil tuo appuntamento è confermato con successo:\n\n📅 Data: *${
    details.dateStr
  }*\n⏰ Orario: *${details.timeStr}*\n✂️ Trattamento: *${
    details.serviceName || "Taglio Capelli"
  }* ${
    details.priceFormatted ? `(${details.priceFormatted})` : ""
  }\n\n📍 Ti aspettiamo in salone in C.so Orbassano 230/a, Torino (Presso "Wild Effect"). Tel. 331 81 76 178.`;

  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/**
 * Genera il link wa.me diretto per inviare il promemoria 24h / giorno prima al cliente.
 * 100% Gratuito, apre WhatsApp Web o l'app su smartphone con testo pronto da inviare.
 */
export function buildReminderWhatsAppUrl(details: {
  customerName: string;
  customerPhone?: string;
  dateStr: string;
  timeStr: string;
  serviceName?: string;
}): string {
  let cleanPhone = (details.customerPhone || "").replace(/\D/g, "");
  if (cleanPhone.length === 10 && !cleanPhone.startsWith("39")) {
    cleanPhone = `39${cleanPhone}`;
  }

  const text = `💈 *Barbershop Roberto Baccaro - Dal 1958*\n\nCiao ${
    details.customerName
  }! 👋\nTi ricordiamo con piacere il tuo appuntamento:\n\n📅 Data: *${
    details.dateStr
  }*\n⏰ Orario: *${details.timeStr}*${
    details.serviceName ? `\n✂️ Trattamento: *${details.serviceName}*` : ""
  }\n\n📍 Ti aspettiamo a Torino in C.so Orbassano 230/a (presso "Wild Effect")!\nIn caso di imprevisto o necessità di modificare l'orario, puoi avvisarci direttamente rispondendo a questo messaggio o al 331 81 76 178.\nA presto! ✂️`;

  if (cleanPhone) {
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
  }
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export interface DailyAgendaItem {
  timeStr: string;
  customerName: string;
  customerPhone?: string;
  durationMinutes: number;
  serviceName?: string;
  isBlocked?: boolean;
  notes?: string | null;
  internalNote?: string | null;
  isNewCustomer?: boolean;
  isVipLoyal?: boolean;
  completedCuts?: number;
}

/**
 * Genera il link WhatsApp per inviare al barbiere (o fargli consultare su WhatsApp)
 * l'agenda completa e formattata con la scaletta degli appuntamenti della giornata.
 */
export function buildBarberDailyAgendaWhatsAppUrl(params: {
  barberPhone?: string;
  dateStr: string;
  items: DailyAgendaItem[];
}): string {
  let cleanPhone = (params.barberPhone || "").replace(/\D/g, "");
  if (cleanPhone.length === 10 && !cleanPhone.startsWith("39")) {
    cleanPhone = `39${cleanPhone}`;
  }

  const lines: string[] = [
    `💈 *BARBERSHOP ROBERTO BACCARO - Dal 1958*`,
    `📋 *Agenda di ${params.dateStr}*`,
    `──────────────────────────`,
  ];

  if (params.items.length === 0) {
    lines.push(`_Nessun appuntamento in programma per questa giornata._`);
  } else {
    params.items.forEach((item) => {
      if (item.isBlocked) {
        lines.push(`⛔ *${item.timeStr}* - Slot Bloccato / Pausa (${item.durationMinutes} min)`);
      } else {
        let tag = "";
        if (item.isNewCustomer) {
          tag = " 🟢 *[Nuovo]*";
        } else if (item.isVipLoyal) {
          tag = ` ⭐ *[Fedele (${item.completedCuts || 0})]*`;
        }
        lines.push(`✂️ *${item.timeStr}* - *${item.customerName}*${tag} (${item.durationMinutes} min)`);
        if (item.serviceName) {
          lines.push(`   └ Trattamento: ${item.serviceName}`);
        }
        if (item.customerPhone) {
          lines.push(`   └ Tel: ${item.customerPhone}`);
        }
        if (item.notes) {
          lines.push(`   └ Note cliente: _${item.notes}_`);
        }
        if (item.internalNote) {
          lines.push(`   └ 🔒 Riservato: _${item.internalNote}_`);
        }
      }
    });
  }

  const activeClients = params.items.filter((i) => !i.isBlocked).length;
  lines.push(`──────────────────────────`);
  lines.push(`✨ *Totale: ${activeClients} ${activeClients === 1 ? "appuntamento" : "appuntamenti"}*`);
  lines.push(`Buon lavoro in salone! ✂️`);

  const fullText = lines.join("\n");

  if (cleanPhone) {
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(fullText)}`;
  }
  return `https://wa.me/?text=${encodeURIComponent(fullText)}`;
}
