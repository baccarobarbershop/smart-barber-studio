"use client";

import { useState, useEffect } from "react";
import { format, addDays, isToday, isTomorrow, isValid } from "date-fns";
import { it } from "date-fns/locale";
import { BookingModal } from "@/components/booking/BookingModal";
import { ManageAppointmentModal } from "@/components/booking/ManageAppointmentModal";
import { requestHumanOperator, cancelHumanOperatorRequest } from "@/app/actions/handoff";
import { getSalonPublicInfo } from "@/app/actions/salon";
import { Sparkles, ArrowLeft, Calendar, Send, Clock, Loader2, CalendarCheck, UserCheck, Phone, MessageSquare, RotateCcw } from "lucide-react";
import {
  getLiveChatSession,
  sendLiveChatMessage,
  setBarberActiveStatus,
  initOrUpdateLiveChatSession,
  type LiveChatSession,
} from "@/app/actions/live-chat";
import { normalizePhoneDigits } from "@/lib/phone";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

interface ToolResultSlots {
  date: string;
  isClosed: boolean;
  closureReason?: string;
  availableSlots: string[];
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  slotsResult?: ToolResultSlots;
  isHandoffNotice?: boolean;
}

interface ProposedGroup {
  dateStr: string; // "YYYY-MM-DD"
  dateLabel: string; // e.g. "Giovedì 12 Novembre"
  times: string[];
}

function parseProposedSlots(content: string, prevUserContent?: string): {
  cleanContent: string;
  groups: ProposedGroup[];
} {
  // 1. Tag strutturati generati dall'AI: [[SLOTS:YYYY-MM-DD:HH:mm,HH:mm,...]]
  const explicitMatches = Array.from(
    content.matchAll(/\[\[SLOTS:(\d{4}-\d{2}-\d{2}):([\d:,\s]+)\]\]/g)
  );

  const cleanContent = content.replace(/\[\[SLOTS:.*?\]\]/g, "").trim();

  if (explicitMatches.length > 0) {
    const groups: ProposedGroup[] = explicitMatches.map((match) => {
      const dateStr = match[1];
      const times = Array.from(
        new Set(
          match[2]
            .split(",")
            .map((t) => t.trim())
            .filter((t) => /^[0-2]?[0-9]:[0-5][0-9]$/.test(t))
        )
      );

      let dateLabel = dateStr;
      try {
        const d = new Date(`${dateStr}T00:00:00`);
        if (isToday(d)) {
          dateLabel = `Oggi (${format(d, "d MMMM", { locale: it })})`;
        } else if (isTomorrow(d)) {
          dateLabel = `Domani (${format(d, "EEEE d MMMM", { locale: it })})`;
        } else {
          dateLabel = format(d, "EEEE d MMMM", { locale: it });
        }
      } catch {}

      return { dateStr, dateLabel, times };
    }).filter((g) => g.times.length > 0);

    if (groups.length > 0) {
      return { cleanContent, groups };
    }
  }

  // 2. Fallback: estrazione orari da elenchi puntati o testo
  const bulletMatches = Array.from(
    cleanContent.matchAll(/(?:^|\n)\s*[*•-]\s*([0-2]?[0-9]:[0-5][0-9])/g)
  ).map((match) => match[1]);

  let times: string[] = [];
  if (bulletMatches.length > 0) {
    times = Array.from(new Set(bulletMatches));
  } else {
    const allTimes = Array.from(
      new Set(cleanContent.match(/\b([0-1]?[0-9]|2[0-3]):[0-5][0-9]\b/g) || [])
    );
    const lower = cleanContent.toLowerCase();
    times = allTimes.filter((t) => {
      const regexNegative = new RegExp(
        `(?:occupat[ioa]|non disponibil[ei]|pien[oa]|prenotat[ioa]|già preso).{0,25}${t}|${t}.{0,25}(?:occupat[ioa]|non disponibil[ei]|pien[oa]|prenotat[ioa]|già preso)`,
        "i"
      );
      return !regexNegative.test(lower);
    });
  }

  if (times.length === 0) {
    return { cleanContent, groups: [] };
  }

  // Riconoscimento intelligente della data dal testo (messaggio assistente o messaggio utente)
  const combinedText = `${cleanContent} ${prevUserContent || ""}`.toLowerCase();
  const now = new Date();
  let resolvedDate = now;

  // A. Match ISO data: YYYY-MM-DD
  const isoMatch = combinedText.match(/\b(202\d-[0-1]\d-[0-3]\d)\b/);
  if (isoMatch) {
    try {
      const parsed = new Date(`${isoMatch[1]}T00:00:00`);
      if (isValid(parsed)) resolvedDate = parsed;
    } catch {}
  } else {
    // B. Match giorno e mese in italiano: es. "12 novembre", "9 nov", "15 dicembre"
    const months = [
      "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
      "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"
    ];
    const datePattern = new RegExp(`\\b([0-3]?[0-9])\\s+(${months.join("|")})\\b`, "i");
    const dateMatch = combinedText.match(datePattern);

    if (dateMatch) {
      const dayNum = parseInt(dateMatch[1], 10);
      const monthIdx = months.indexOf(dateMatch[2].toLowerCase());
      if (monthIdx !== -1 && dayNum >= 1 && dayNum <= 31) {
        resolvedDate = new Date(now.getFullYear(), monthIdx, dayNum);
      }
    } else if (combinedText.includes("dopodomani")) {
      resolvedDate = addDays(now, 2);
    } else if (combinedText.includes("domani")) {
      resolvedDate = addDays(now, 1);
    } else {
      // C. Match giorno della settimana: es. "lunedì", "martedì", "giovedì"...
      const daysOfWeek = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
      let foundDayIdx = -1;
      for (let d = 0; d < 7; d++) {
        if (combinedText.includes(daysOfWeek[d])) {
          foundDayIdx = d;
          break;
        }
      }
      if (foundDayIdx !== -1) {
        const currentDay = now.getDay();
        let diff = foundDayIdx - currentDay;
        if (diff < 0) diff += 7;
        if (diff === 0 && (combinedText.includes("prossim") || !combinedText.includes("oggi"))) {
          diff = 7;
        }
        resolvedDate = addDays(now, diff);
      }
    }
  }

  const dateStr = format(resolvedDate, "yyyy-MM-dd");
  let dateLabel = dateStr;
  try {
    if (isToday(resolvedDate)) {
      dateLabel = `Oggi (${format(resolvedDate, "d MMMM", { locale: it })})`;
    } else if (isTomorrow(resolvedDate)) {
      dateLabel = `Domani (${format(resolvedDate, "EEEE d MMMM", { locale: it })})`;
    } else {
      dateLabel = format(resolvedDate, "EEEE d MMMM", { locale: it });
    }
  } catch {}

  return {
    cleanContent,
    groups: [{ dateStr, dateLabel, times }],
  };
}

interface ChatViewProps {
  initialUserId?: string;
  initialCustomerName?: string;
}

export function ChatView({
  initialUserId = "guest_client",
  initialCustomerName = "",
}: ChatViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roleParam = searchParams?.get("role");
  const sessionIdParam = searchParams?.get("sessionId");
  const clientPhoneParam = searchParams?.get("clientPhone");
  const clientNameParam = searchParams?.get("clientName");

  const isBarber = roleParam === "barber";

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [customerName, setCustomerName] = useState(initialCustomerName);
  const [customerPhone, setCustomerPhone] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedName = localStorage.getItem("smart_barber_customer_name");
      const savedPhone = localStorage.getItem("smart_barber_customer_phone");
      if (savedName) setCustomerName(savedName);
      if (savedPhone) setCustomerPhone(savedPhone);
    }
  }, []);

  // Risoluzione session ID univoco condiviso
  const activeSessionId =
    sessionIdParam ||
    (customerPhone ? normalizePhoneDigits(customerPhone) : "") ||
    (clientPhoneParam ? normalizePhoneDigits(clientPhoneParam) : "") ||
    "live_client";

  const [liveSession, setLiveSession] = useState<LiveChatSession | null>(null);

  // Sincronizzazione in tempo reale con polling della chat condivisa
  useEffect(() => {
    let isMounted = true;
    const syncSession = async () => {
      if (!activeSessionId) return;
      try {
        const s = await getLiveChatSession(activeSessionId);
        if (isMounted && s) {
          setLiveSession(s);
          if (s.isBarberActive) {
            setHandoffSent(true);
          }
        }
      } catch (e) {
        // ignora
      }
    };

    syncSession();
    const interval = setInterval(syncSession, 1500);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeSessionId]);

  const [selectedSlotForBooking, setSelectedSlotForBooking] = useState<{
    date: string;
    time: string;
  } | null>(null);

  const [hasBookedSuccess, setHasBookedSuccess] = useState(false);
  const [handoffSent, setHandoffSent] = useState(false);
  const [handoffLoading, setHandoffLoading] = useState(false);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [salonPhone, setSalonPhone] = useState("02 1234567");
  const [whatsappPhone, setWhatsappPhone] = useState("347 1234567");

  useEffect(() => {
    // Caricamento recapiti configurati per Chiama e WhatsApp
    getSalonPublicInfo().then((info) => {
      if (info.salonPhone) setSalonPhone(info.salonPhone);
      if (info.whatsappPhone) setWhatsappPhone(info.whatsappPhone);
    });

    const handleContactsUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<{ salon_phone?: string; whatsapp_phone?: string }>;
      if (customEvent.detail) {
        if (customEvent.detail.salon_phone) setSalonPhone(customEvent.detail.salon_phone);
        if (customEvent.detail.whatsapp_phone) setWhatsappPhone(customEvent.detail.whatsapp_phone);
      }
    };
    window.addEventListener("smart-barber-contacts-updated", handleContactsUpdated);
    return () => window.removeEventListener("smart-barber-contacts-updated", handleContactsUpdated);
  }, []);

  const handleRequestHuman = async () => {
    setHandoffLoading(true);
    try {
      const activeName = customerName || initialCustomerName || "Cliente";
      const activePhone = customerPhone || clientPhoneParam || undefined;

      await requestHumanOperator(
        initialUserId,
        activeName,
        "Richiesta assistenza manuale dalla chat cliente",
        activePhone
      );

      // Inizializza la sessione condivisa salvando lo storico messaggi
      await initOrUpdateLiveChatSession({
        sessionId: activeSessionId,
        clientName: activeName,
        clientPhone: activePhone || "",
        initialMessages: messages.map((m) => ({ role: m.role, content: m.content })),
        handoffRequested: true,
      });

      setHandoffSent(true);

      // Inserisce notifica nella chat cliente
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: `🔔 Ho inviato una NOTIFICA con allarme sonoro al barbiere in cassa!\nL'allarme acustico è stato attivato con il tuo nome (${activeName}).\n\nNon appena il barbiere clicca "Presa in carico", entrerà direttamente qui in chat per parlare con te!`,
          isHandoffNotice: true,
        },
      ]);
    } catch (e) {
      console.error("Errore richiesta contatto barbiere:", e);
    } finally {
      setHandoffLoading(false);
    }
  };

  const handleCancelHumanRequest = async () => {
    setHandoffLoading(true);
    try {
      await cancelHumanOperatorRequest(initialUserId, customerPhone || undefined);
      await setBarberActiveStatus(activeSessionId, false);
      setHandoffSent(false);

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: `Richiesta al barbiere annullata. Sono di nuovo a tua completa disposizione! Come posso aiutarti?`,
        },
      ]);
    } catch (e) {
      console.error("Errore annullamento richiesta barbiere:", e);
    } finally {
      setHandoffLoading(false);
    }
  };

  const handleReleaseToAi = async () => {
    if (!activeSessionId) return;
    try {
      await setBarberActiveStatus(activeSessionId, false);
      const updated = await getLiveChatSession(activeSessionId);
      setLiveSession(updated);
      setHandoffSent(false);
      router.push("/admin");
    } catch (e) {
      console.error("Errore rilascio chat all'AI:", e);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
    setInput("");

    // SE IL BARBIERE È ATTIVO (O SIAMO IL BARBIERE), SCRIVI NELLA CHAT LIVE DIRETTA
    if (isBarber || liveSession?.isBarberActive) {
      try {
        const senderRole = isBarber ? "barber" : "client";
        const senderName = isBarber ? "Barbiere (In Salone)" : (customerName || clientNameParam || "Cliente");
        await sendLiveChatMessage({
          sessionId: activeSessionId,
          senderRole,
          senderName,
          content: userText,
        });

        const updated = await getLiveChatSession(activeSessionId);
        if (updated) setLiveSession(updated);
      } catch (err) {
        console.error("Errore invio messaggio live chat:", err);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // MODALITÀ STANDARD CON ASSISTENTE VIRTUALE AI (GEMINI)
    const newMessages: ChatMessage[] = [
      ...messages,
      { id: Date.now().toString(), role: "user", content: userText },
    ];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const savedPhone =
        typeof window !== "undefined"
          ? localStorage.getItem("smart_barber_customer_phone")
          : null;
      const savedName =
        typeof window !== "undefined"
          ? localStorage.getItem("smart_barber_customer_name")
          : null;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          userId: initialUserId,
          customerName: savedName || initialCustomerName,
          customerPhone: savedPhone,
        }),
      });

      if (!res.ok) {
        throw new Error("Errore durante la risposta dell'assistente");
      }

      // Leggi la risposta (stream o testo)
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      const assistantId = (Date.now() + 1).toString();

      // Placeholder per il messaggio assistant in arrivo
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "" },
      ]);

      if (reader) {
        let isDone = false;
        while (!isDone) {
          const { value, done } = await reader.read();
          isDone = done;
          if (value) {
            const chunk = decoder.decode(value, { stream: true });
            assistantText += chunk;

            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: assistantText } : m
              )
            );
          }
        }
      }
    } catch (err: unknown) {
      console.error("Errore chat:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content:
            "Si è verificato un errore di connessione con l'AI. Puoi usare il selettore tradizionale a 14 giorni cliccando sul pulsante in alto.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto flex flex-col h-[90vh] glass-panel-gold rounded-3xl overflow-hidden border border-amber-500/30 shadow-2xl">
      {/* Top Header Pulito e Spazioso */}
      <div className="px-4 py-3 bg-zinc-950/90 border-b border-zinc-800/80 flex items-center justify-between gap-3">
        {/* Left: Freccia Indietro + Avatar + Nome Salone */}
        <div className="flex items-center gap-2.5 min-w-0">
          <Link
            href={isBarber ? "/admin" : "/"}
            className="p-1.5 -ml-1 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition shrink-0"
            title={isBarber ? "Torna al Pannello Admin" : "Torna alla Home"}
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="relative shrink-0">
            <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shadow-sm ${
              isBarber
                ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-sm font-bold"
                : "bg-amber-500/10 border border-amber-500/30 text-amber-400"
            }`}>
              {isBarber ? "✂️" : <Sparkles className="w-4 h-4" />}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-zinc-950 ring-1 ring-emerald-500/50" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-zinc-100 truncate tracking-tight whitespace-nowrap">
              {isBarber
                ? `Chat con ${clientNameParam || liveSession?.clientName || "Cliente"}`
                : "Smart Barber Studio"}
            </h2>
            <p className="text-[11px] text-zinc-400 truncate flex items-center gap-1.5 whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span>
                {isBarber
                  ? "Connesso con il Cliente"
                  : liveSession?.isBarberActive
                  ? "Barbiere in Linea"
                  : "Assistente Virtuale"}
              </span>
            </p>
          </div>
        </div>

        {/* Right: Pulsante Diretto per il Barbiere */}
        <div className="shrink-0 flex items-center gap-2">
          {isBarber ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleReleaseToAi}
                title="Riconsegna la chat all'Assistente AI"
                className="px-2.5 py-1.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
              >
                <RotateCcw className="w-3.5 h-3.5 text-red-400" />
                <span>Rilascia all&apos;AI</span>
              </button>
              <Link
                href="/admin"
                className="px-2.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-bold transition"
              >
                Admin
              </Link>
            </div>
          ) : liveSession?.isBarberActive ? (
            <span className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center gap-1.5 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Barbiere Connesso</span>
            </span>
          ) : handoffSent ? (
            <button
              type="button"
              disabled={handoffLoading}
              onClick={handleCancelHumanRequest}
              title="Annulla la richiesta e torna a chattare con l'Assistente Virtuale"
              className="px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-red-500/20 hover:border-red-500/40 hover:text-red-300 shadow-sm whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Torna all&apos;Assistente</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={handoffLoading}
              onClick={handleRequestHuman}
              title="Richiedi l'assistenza diretta del barbiere in salone"
              className="px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition bg-zinc-900 hover:bg-amber-500 hover:text-black text-amber-300 border-amber-500/30 shadow-sm whitespace-nowrap"
            >
              {handoffLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
              ) : (
                <>
                  <UserCheck className="w-3.5 h-3.5 text-amber-400" />
                  <span>Parla col Barbiere</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Banner di Presa in Carico Barbiere */}
      {isBarber && (
        <div className="px-4 py-2 bg-emerald-950/80 border-b border-emerald-500/40 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
            <span className="font-extrabold text-emerald-300">
              Operatore Salone Connesso con {clientNameParam || liveSession?.clientName || "Cliente"}
            </span>
            {clientPhoneParam && (
              <span className="text-zinc-400 font-mono text-[11px]">({clientPhoneParam})</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {clientPhoneParam && (
              <>
                <a
                  href={`https://wa.me/${clientPhoneParam.replace(/\D/g, "").startsWith("39") ? clientPhoneParam.replace(/\D/g, "") : `39${clientPhoneParam.replace(/\D/g, "")}`}?text=${encodeURIComponent(`💈 Ciao ${clientNameParam || ""}, sono il barbiere di Smart Barber Studio! Ho preso in carico la tua richiesta.`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center gap-1.5 transition shadow"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>WhatsApp</span>
                </a>
                <a
                  href={`tel:${clientPhoneParam.replace(/\s+/g, "")}`}
                  className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 font-semibold text-[11px] flex items-center gap-1.5 transition"
                >
                  <Phone className="w-3 h-3 text-emerald-400" />
                  <span>Chiama</span>
                </a>
              </>
            )}
          </div>
        </div>
      )}

      {/* Banner per il cliente quando il barbiere è connesso */}
      {!isBarber && liveSession?.isBarberActive && (
        <div className="px-4 py-2 bg-emerald-950/70 border-b border-emerald-500/40 flex items-center justify-between gap-2 text-xs text-emerald-300 animate-in fade-in">
          <span className="flex items-center gap-2 font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Il Barbiere ha preso in carico la chat ed è in linea con te!</span>
          </span>
          <span className="text-[10px] text-zinc-400">Scrivi pure qui sotto</span>
        </div>
      )}

      {/* Barra Scorciatoie Rapide Sottostante */}
      <div className="px-3 py-2 bg-zinc-950/60 border-b border-zinc-800/60 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIsManageModalOpen(true)}
          title="Gestisci o disdici un tuo appuntamento esistente"
          className="flex-1 py-1.5 px-2.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-amber-300 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition shadow-sm whitespace-nowrap"
        >
          <CalendarCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>I Miei Appuntamenti</span>
        </button>

        <Link
          href="/book"
          title="Passa alla vista calendario a 14 giorni"
          className="flex-1 py-1.5 px-2.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-amber-300 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition shadow-sm whitespace-nowrap"
        >
          <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>Calendario 14 Giorni</span>
        </Link>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4 text-xs">
        {/* SE LA CHAT È PRESA IN CARICO DAL BARBIERE (MODALITÀ LIVE OPERATORE) */}
        {liveSession && (isBarber || liveSession.isBarberActive) ? (
          <div className="space-y-3">
            {liveSession.messages.length === 0 ? (
              <div className="p-4 rounded-2xl bg-zinc-900/60 border border-dashed border-zinc-800 text-center text-zinc-400 text-xs">
                {isBarber
                  ? `Chat avviata con ${clientNameParam || liveSession.clientName}. Scrivi un messaggio qui sotto per rispondere in tempo reale.`
                  : "Il Barbiere ha preso in carico la richiesta! Invia un messaggio qui sotto per parlare direttamente con lui."}
              </div>
            ) : (
              liveSession.messages.map((m) => {
                if (m.senderRole === "system") {
                  return (
                    <div key={m.id} className="flex justify-center my-2 animate-in fade-in">
                      <span className="text-[11px] font-semibold bg-zinc-900 border border-emerald-500/30 text-emerald-300 px-3 py-1 rounded-full shadow-sm">
                        {m.content}
                      </span>
                    </div>
                  );
                }

                // Se siamo il barbiere, i messaggi del barbiere stanno a destra (isSelf), quelli del cliente a sinistra
                // Se siamo il cliente, i messaggi del cliente stanno a destra (isSelf), quelli del barbiere a sinistra
                const isSelf = isBarber ? m.senderRole === "barber" : m.senderRole === "client";
                const isBarberSender = m.senderRole === "barber";

                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${isSelf ? "items-end" : "items-start"} animate-in fade-in duration-150`}
                  >
                    <div className={`flex gap-2.5 max-w-[90%] ${isSelf ? "flex-row-reverse" : "flex-row"}`}>
                      {!isSelf && (
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs shrink-0 shadow-sm ${
                            isBarberSender
                              ? "bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 font-bold"
                              : "bg-amber-500/20 border border-amber-500/50 text-amber-300 font-bold"
                          }`}
                        >
                          {isBarberSender ? "✂️" : "👤"}
                        </div>
                      )}

                      <div className="space-y-1">
                        {!isSelf && (
                          <span className="text-[10px] font-bold text-zinc-400 pl-1 block">
                            {m.senderName}
                          </span>
                        )}
                        <div
                          className={`rounded-2xl p-3.5 text-xs shadow-md ${
                            isSelf
                              ? "bg-amber-500 text-black font-semibold rounded-tr-sm"
                              : isBarberSender
                              ? "bg-emerald-950/80 border border-emerald-500/40 text-emerald-100 rounded-tl-sm font-medium"
                              : "bg-zinc-900/95 border border-zinc-800 text-zinc-100 rounded-tl-sm"
                          }`}
                        >
                          <p className="leading-relaxed whitespace-pre-wrap">{m.content}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* MODALITÀ STANDARD CON ASSISTENTE VIRTUALE AI (GEMINI) */
          <>
            {/* Welcome message personalizzato */}
            <div className="flex gap-2.5 max-w-[88%]">
              <div className="w-7 h-7 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 text-xs shrink-0">
                ✂️
              </div>
              <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl rounded-tl-sm p-3.5 space-y-2 text-zinc-200">
                <p>
                  {customerName ? (
                    <>
                      Ciao <strong className="text-amber-400">{customerName}</strong>, benvenuto a <strong>Smart Barber Studio</strong>! Posso verificare gli orari in tempo reale e prenotare il tuo appuntamento.
                    </>
                  ) : (
                    <>
                      Benvenuto a <strong>Smart Barber Studio</strong>! Posso verificare gli orari in tempo reale e prenotare il tuo appuntamento.
                    </>
                  )}
                </p>
                <p className="text-zinc-400 text-[11px]">
                  Esempi: <em>"C'è posto oggi alle 16:30?"</em> oppure <em>"Quando hai libero giovedì?"</em>
                </p>
              </div>
            </div>

            {/* Message list */}
            {messages.map((m, idx) => {
              const isUser = m.role === "user";
              const prevUserMessage = !isUser && idx > 0 ? messages[idx - 1]?.content : undefined;
              const { cleanContent, groups } = !isUser
                ? parseProposedSlots(m.content, prevUserMessage)
                : { cleanContent: m.content, groups: [] };

              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`flex gap-2.5 max-w-[92%] ${isUser ? "flex-row-reverse" : "flex-row"
                      }`}
                  >
                    {!isUser && (
                      <div className="w-7 h-7 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 text-xs shrink-0">
                        ✂️
                      </div>
                    )}

                    <div
                      className={`rounded-2xl p-3.5 text-xs ${isUser
                        ? "bg-amber-500 text-black font-semibold rounded-tr-sm shadow-md shadow-amber-500/20"
                        : "bg-zinc-900/95 border border-zinc-800 text-zinc-100 rounded-tl-sm space-y-3"
                        }`}
                    >
                      <p className="leading-relaxed whitespace-pre-wrap">{cleanContent}</p>

                      {/* GENERATIVE UI: Slot Proposti con data esatta verificata */}
                      {!isUser && groups.length > 0 && (
                        <div className="space-y-3 pt-2">
                          {groups.map((group) => (
                            <div
                              key={group.dateStr}
                              className="pt-2 border-t border-zinc-800/80 space-y-2"
                            >
                              <div className="flex items-center justify-between text-[11px] text-amber-400 font-bold capitalize">
                                <span className="flex items-center gap-1.5">
                                  <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                  <span>Disponibilità: {group.dateLabel}</span>
                                </span>
                                <span className="text-zinc-500 text-[10px] lowercase">Tocca per prenotare</span>
                              </div>

                              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                                {group.times.map((slot) => (
                                  <button
                                    key={`${group.dateStr}-${slot}`}
                                    type="button"
                                    onClick={() =>
                                      setSelectedSlotForBooking({
                                        date: group.dateStr,
                                        time: slot,
                                      })
                                    }
                                    className="py-2 px-1 rounded-lg bg-zinc-900 border border-amber-500/40 hover:bg-amber-500 hover:text-black font-bold text-center text-amber-300 transition shadow-sm text-xs active:scale-95"
                                  >
                                    {slot}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* SCHEDA AZIONE DIRETTA: CONTATTO BARBIERE */}
                      {m.isHandoffNotice && (
                        <div className="pt-2 border-t border-zinc-800 space-y-2.5">
                          <div className="flex items-center gap-2 text-[11px] text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/30 p-2.5 rounded-xl">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
                            <span>Avviso in cassa attivato • In attesa del barbiere</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <a
                              href={`tel:${salonPhone.replace(/\s+/g, "")}`}
                              className="py-2.5 px-3 rounded-xl bg-zinc-900 border border-amber-500/40 text-amber-300 font-bold text-center flex items-center justify-center gap-1.5 text-xs hover:bg-amber-500 hover:text-black transition shadow-sm"
                            >
                              <Phone className="w-3.5 h-3.5" />
                              <span>Chiama Salone</span>
                            </a>
                            <a
                              href={`https://wa.me/${whatsappPhone.replace(/\D/g, "")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-center flex items-center justify-center gap-1.5 text-xs transition shadow-sm"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>WhatsApp</span>
                            </a>
                          </div>

                          {/* Pulsante per ANNULLARE la richiesta e tornare a chattare con l'Assistente */}
                          <button
                            type="button"
                            disabled={handoffLoading}
                            onClick={handleCancelHumanRequest}
                            className="w-full py-2.5 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-amber-500/40 text-zinc-300 hover:text-amber-300 text-xs font-bold flex items-center justify-center gap-2 transition shadow-sm"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                            <span>Annulla Richiesta e Torna all&apos;Assistente</span>
                          </button>
                        </div>
                      )}

                      {/* Orari strutturati restituiti */}
                      {m.slotsResult && (
                        <div className="bg-zinc-950/90 rounded-2xl p-3.5 border border-amber-500/30 space-y-2.5 shadow-lg">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-bold text-amber-400 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Orari disponibili per il {m.slotsResult.date}
                            </span>
                            <span className="text-zinc-500 text-[10px]">30 min</span>
                          </div>

                          {m.slotsResult.availableSlots.length === 0 ? (
                            <p className="text-zinc-500 text-[11px] italic">
                              Nessun posto disponibile per questa data.
                            </p>
                          ) : (
                            <div className="grid grid-cols-3 gap-1.5">
                              {m.slotsResult.availableSlots.map((slot) => (
                                <button
                                  key={slot}
                                  type="button"
                                  onClick={() =>
                                    setSelectedSlotForBooking({
                                      date: m.slotsResult!.date,
                                      time: slot,
                                    })
                                  }
                                  className="py-2 px-1 rounded-lg bg-zinc-900 border border-amber-500/40 hover:bg-amber-500 hover:text-black font-bold text-center text-amber-300 transition shadow-sm text-xs"
                                >
                                  {slot}
                                </button>
                              ))}
                            </div>
                          )}

                          <p className="text-[10px] text-zinc-500 text-center">
                            Tocca un orario per inserire i dati e confermare.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {isLoading && (
          <div className="flex items-center gap-2 text-zinc-500 text-xs py-2 pl-2">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span>L'assistente sta verificando...</span>
          </div>
        )}
      </div>

      {/* Input Form */}
      <form
        onSubmit={handleSendMessage}
        className="p-3 bg-zinc-950/90 border-t border-zinc-800 flex items-center gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            isBarber
              ? `Scrivi un messaggio diretto a ${clientNameParam || liveSession?.clientName || "questo cliente"}...`
              : liveSession?.isBarberActive
              ? "Scrivi direttamente al barbiere..."
              : "Chiedi un appuntamento o orari liberi..."
          }
          className="flex-1 bg-zinc-900 border border-zinc-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 placeholder:text-zinc-500 outline-none transition"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="p-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold disabled:opacity-40 transition shadow-md shadow-amber-500/20"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>

      {/* Booking Modal attivato al click dello slot Generative UI */}
      {selectedSlotForBooking && (
        <BookingModal
          isOpen={true}
          onClose={() => {
            setSelectedSlotForBooking(null);
            if (hasBookedSuccess) {
              router.push("/");
            }
          }}
          date={selectedSlotForBooking.date}
          time={selectedSlotForBooking.time}
          onBookingSuccess={() => {
            setHasBookedSuccess(true);
          }}
          closeButtonLabel="Fatto (Chiudi Chat)"
          autoCloseDelayMs={2200}
        />
      )}

      {/* Modal Gestione e Disdetta Veloce */}
      <ManageAppointmentModal
        isOpen={isManageModalOpen}
        onClose={() => setIsManageModalOpen(false)}
      />
    </div>
  );
}
