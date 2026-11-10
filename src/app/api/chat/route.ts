import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { streamText } from "ai";
import { getAvailableSlots } from "@/lib/booking/slots";
import { checkAndResolveHandoffTimeout } from "@/app/actions/handoff";
import { getCustomerFidelityCard } from "@/app/actions/fidelity";
import { getSalonPublicInfo } from "@/app/actions/salon";
import { checkCustomerNoShowStatus } from "@/app/actions/admin";
import { getLiveChatSession } from "@/app/actions/live-chat";
import { format, addDays } from "date-fns";
import { it } from "date-fns/locale";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY || "",
});

export async function POST(req: Request) {
  try {
    const { messages, userId, customerName, customerPhone } = await req.json();

    const now = new Date();
    const currentDateTimeStr = format(now, "EEEE d MMMM yyyy, HH:mm", { locale: it });

    // 0. Recupero dati fedeltà cliente riconosciuto
    let clientRecognitionContext = "";
    const activeName = customerName?.trim() || "";

    if (customerPhone) {
      try {
        const [cardRes, noShowStatus] = await Promise.all([
          getCustomerFidelityCard(customerPhone),
          checkCustomerNoShowStatus(customerPhone),
        ]);

        const c = cardRes.success && cardRes.card ? cardRes.card : null;
        const finalName = activeName || c?.customerName || "Gentile Cliente";

        if (noShowStatus.isBlocked) {
          clientRecognitionContext = `
STATO SPECIALE CLIENTE: BLOCCATO PER 3 NO-SHOW.
- Nome cliente: ${finalName}
- Telefono: ${customerPhone}
- Questo cliente ha accumulato 3 appuntamenti a cui NON si è presentato senza disdire.
REGOLE TASSATIVE:
- NON proporre date e NON proporre orari di prenotazione.
- Spiega con massima educazione ed eleganza che per prenotare il prossimo appuntamento deve contattare direttamente il salone al telefono o via WhatsApp.
`;
        } else if (c) {
          clientRecognitionContext = `
DATI CLIENTE RICONOSCIUTO (VIP):
- Nome del cliente: ${finalName}
- Numero di telefono: ${c.phone}
- Punteggio Tessera Fedeltà: ${c.fidelityPoints} / ${c.targetPoints} appuntamenti
- Premio al raggiungimento: "${c.rewardDescription}" (${c.isUnlocked ? "🏆 PREMIO GIÀ MATURATO E SBLOCCATO!" : `mancano ${c.pointsRemaining} appuntamenti`})

REGOLE OBBLIGATORIE PERSONALIZZAZIONE NOME:
- Rivolgiti SEMPRE al cliente chiamandolo direttamente per nome ("${finalName}") nei saluti e nelle risposte (es. "Certamente ${finalName}!", "Perfetto ${finalName}, ecco le nostre migliori disponibilità:").
- Fallo sentire un cliente VIP esclusivo e benvenuto!
`;
        }
      } catch (e) {
        console.error("Errore recupero card cliente in chat:", e);
      }
    } else if (activeName) {
      clientRecognitionContext = `
DATI CLIENTE:
- Nome del cliente: ${activeName}
- Rivolgiti SEMPRE al cliente per nome ("${activeName}") per salutarlo ed assisterlo con eleganza!
`;
    }

    // 1. Controllo Human-in-the-Loop, Presa in Carico Barbiere & Timeout automatico
    const cleanDigits = customerPhone ? customerPhone.replace(/\D/g, "") : "";
    const activeSessionId = cleanDigits || userId || "live_client";
    const liveSession = await getLiveChatSession(activeSessionId);

    if (liveSession?.isBarberActive) {
      return new Response(
        "Il barbiere ha preso in carico la chat ed è connesso in salone. I tuoi messaggi vengono recapitati direttamente a lui.",
        { headers: { "Content-Type": "text/plain; charset=utf-8" } }
      );
    }

    if (userId) {
      const handoffStatus = await checkAndResolveHandoffTimeout(userId);
      if (handoffStatus.aiPaused) {
        return new Response(
          "La richiesta è stata inoltrata al barbiere. Ti risponderà a breve! (Se non risponde entro 3 minuti, riprenderò io ad assisterti).",
          { headers: { "Content-Type": "text/plain; charset=utf-8" } }
        );
      }
    }

    // 2. Recupero listino prezzi, servizi e finestra di prenotazione dal salone
    let salonServicesContext = "";
    let maxAdvanceDays = 14;
    try {
      const salonInfo = await getSalonPublicInfo();
      if (salonInfo.maxAdvanceDays) {
        maxAdvanceDays = salonInfo.maxAdvanceDays;
      }
      const activeServices = (salonInfo.services || []).filter((s) => s.enabled);
      if (activeServices.length > 0) {
        const servicesListStr = activeServices
          .map(
            (s) =>
              `- ${s.name}: ${(s.price_cents / 100).toFixed(2).replace(".00", "")} € (~${s.duration_minutes} min)${
                s.description ? ` - ${s.description}` : ""
              }`
          )
          .join("\n");

        salonServicesContext = `
LISTINO PREZZI E TRATTAMENTI DEL SALONE (FONTE DI VERITÀ UFFICIALE):
${servicesListStr}
`;
      }
    } catch (e) {
      console.error("Errore recupero listino in chat:", e);
    }

    // 2b. Recupero deterministico in tempo reale degli slot liberi da Supabase per i prossimi ${maxAdvanceDays} giorni
    const dayIndices = Array.from({ length: maxAdvanceDays }, (_, i) => i);
    const upcomingScheduleResults = await Promise.all(
      dayIndices.map(async (i) => {
        const targetDate = addDays(now, i);
        const dateStr = format(targetDate, "yyyy-MM-dd");
        const dayLabel = format(targetDate, "EEEE d MMMM", { locale: it });

        try {
          const avail = await getAvailableSlots(dateStr);
          if (avail.isClosed) {
            return `- ${dayLabel} (${dateStr}): CHIUSO (${avail.closureReason || "Ferie / Festivo"})`;
          } else {
            const freeSlots = avail.slots.filter((s) => s.available).map((s) => s.time);
            const bookedSlots = avail.slots.filter((s) => s.reason === "booked").map((s) => s.time);

            let line = `- ${dayLabel} (${dateStr}): `;
            if (freeSlots.length === 0) {
              line += "TUTTO ESAURITO";
            } else {
              line += `DISPONIBILI: [${freeSlots.join(", ")}]`;
            }
            if (bookedSlots.length > 0) {
              line += ` | GIÀ PRENOTATI / OCCUPATI (NON DISPONIBILI): [${bookedSlots.join(", ")}]`;
            }
            return line;
          }
        } catch (e) {
          console.error("Errore fetch slots per data:", dateStr, e);
          return `- ${dayLabel} (${dateStr}): Errore caricamento`;
        }
      })
    );

    const scheduleContext = upcomingScheduleResults.join("\n");

    // 3. System Prompt Rigoroso (Zero Hallucination Policy)
    const systemPrompt = `
Sei l'assistente virtuale ufficiale del prestigioso salone da barbiere "Barbershop Roberto Baccaro" (Barberia "Dal 1958", con sede a Torino in C.so Orbassano 230/a, presso "Wild Effect").
Contatti Salone: Tel. 331 81 76 178 • WhatsApp: 331 81 76 178.
Orari di apertura: Martedì - Sabato dalle 09:00 alle 19:00 (orario continuato). Lunedì e Domenica: CHIUSO. È gradito l'appuntamento.
Oggi è: ${currentDateTimeStr}.
${clientRecognitionContext}
${salonServicesContext}
CALENDARIO E DISPONIBILITÀ IN TEMPO REALE DA SUPABASE (FONTE DI VERITÀ ASSOLUTA ED INVIOLABILE PER I PROSSIMI ${maxAdvanceDays} GIORNI):
${scheduleContext}

REGOLE FERREE (ZERO ALLUCINAZIONI):
1. Proponi ESCLUSIVAMENTE gli orari presenti nella lista dei DISPONIBILI. NON inventare o supporre mai disponibilità non presenti.
2. ATTENZIONE AGLI ORARI OCCUPATI: Gli orari segnalati come "GIÀ PRENOTATI / OCCUPATI" sono già stati presi da altri clienti! Se un utente ti chiede uno di quegli orari specifici (ad esempio se chiede "alle 9:30" o "c'è posto alle 09:30?" e le 09:30 risultano occupate), digli chiaramente con garbo che quell'orario è già occupato/prenotato, e proponigli come alternative gli orari DISPONIBILI più vicini di quel giorno o del primo giorno utile.
3. Se un giorno è CHIUSO o TUTTO ESAURITO, comunicalo espressamente e proponi subito le date aperte con orari liberi.
4. Tono di voce e personalizzazione: elegante, accogliente, professionale, chiaro e sintetico in italiano. Usa SEMPRE il nome del cliente per salutarlo e rispondere con calore e stile esclusivo.
5. INFORMAZIONI PREZZI E SERVIZI: Se il cliente chiede quanto costa un servizio o quali trattamenti offrite (es. costo taglio, barba, combo, shampoo, durata), rispondi citando con precisione i prezzi e le descrizioni dal LISTINO PREZZI E TRATTAMENTI ufficiale sopra riportato.
6. PULSANTI RAPIDI PRENOTAZIONE (FONDAMENTALE PER LA DATA CORRETTA):
Quando proponi orari disponibili per una o più date, scrivi cordialmente il testo in italiano E AGGIUNGI SEMPRE ALLA FINE del messaggio (su una riga separata) il marcatore speciale con la DATA ESATTA in formato ISO YYYY-MM-DD e gli orari proposti:
[[SLOTS:YYYY-MM-DD:HH:mm,HH:mm,...]]

Esempi:
- Se proponi orari per giovedì 12 novembre 2026 (2026-11-12) come 09:30 e 15:00:
[[SLOTS:2026-11-12:09:30,15:00]]

- Se proponi orari per oggi (2026-11-08) o per domani (2026-11-09):
[[SLOTS:2026-11-09:14:30,15:00]]

ATTENZIONE CRITICA: La data nel tag [[SLOTS:YYYY-MM-DD:...]] deve corrispondere ESATTAMENTE alla data degli orari di cui parli nel testo! MAI mettere la data di oggi se stai proponendo orari per un giorno futuro!
7. DISDETTA O SPOSTAMENTO (REGOLA FERREA FREEZE):
- Se il cliente chiede di disdire o spostare un appuntamento il cui orario è GIÀ SUPERATO rispetto a adesso (${currentDateTimeStr}), informalo con chiarezza ed educazione che l'appuntamento è già trascorso ed è concluso/freezato, pertanto non può più essere modificato né disdetto.
- Per appuntamenti futuri, invitalo calorosamente a toccare il pulsante "I Miei Appuntamenti" in alto a destra nella chat (che verifica il preavviso e notifica all'istante il barbiere con allarme sonoro urgente). Ricorda con garbo che per disdette con poco preavviso (meno di 2 ore) il sistema invia subito l'avviso urgente al barbiere ma invita anche a contattare il salone al telefono o su WhatsApp per liberare la poltrona.
8. FINESTRA MASSIMA DI PRENOTAZIONE: L'agenda del salone è aperta fino a un massimo di ${maxAdvanceDays} giorni in avanti rispetto a oggi. Se il cliente chiede disponibilità per date oltre i prossimi ${maxAdvanceDays} giorni, spiegagli con garbo che il calendario apre progressivamente fino a un massimo di ${maxAdvanceDays} giorni.
`;

    const result = streamText({
      model: google("gemini-flash-lite-latest"),
      system: systemPrompt,
      messages,
      temperature: 0,
    });

    return result.toTextStreamResponse();
  } catch (error: unknown) {
    console.error("Errore in /api/chat:", error);
    return new Response(
      "Si è verificato un errore momentaneo nell'interrogazione dell'assistente. Riprova tra pochi istanti o consulta la sezione Calendario 14 Giorni.",
      { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }
}
