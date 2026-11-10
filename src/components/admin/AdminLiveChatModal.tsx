"use client";

import { useState, useEffect, useRef } from "react";
import {
  getLiveChatSession,
  sendLiveChatMessage,
  setBarberActiveStatus,
  type LiveChatSession,
  type LiveChatMessage,
} from "@/app/actions/live-chat";
import { normalizePhoneDigits } from "@/lib/phone";
import {
  MessageSquare,
  Send,
  X,
  Phone,
  RotateCcw,
  Loader2,
  CheckCheck,
  User,
  Scissors,
  ExternalLink,
} from "lucide-react";

interface AdminLiveChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRelease?: () => void;
  sessionId: string;
  clientName: string;
  clientPhone?: string;
  directWhatsAppUrl?: string;
}

export function AdminLiveChatModal({
  isOpen,
  onClose,
  onRelease,
  sessionId,
  clientName,
  clientPhone,
  directWhatsAppUrl,
}: AdminLiveChatModalProps) {
  const [session, setSession] = useState<LiveChatSession | null>(null);
  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isReleasing, setIsReleasing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const cleanPhone = clientPhone ? normalizePhoneDigits(clientPhone) : normalizePhoneDigits(sessionId);
  const resolvedSessionId = normalizePhoneDigits(sessionId) || sessionId;

  // Polling per ricevere i nuovi messaggi del cliente in tempo reale
  useEffect(() => {
    if (!isOpen || !resolvedSessionId) return;

    let isMounted = true;
    const fetchSession = async () => {
      try {
        const s = await getLiveChatSession(resolvedSessionId);
        if (isMounted && s) {
          setSession(s);
          setMessages(s.messages || []);
        }
      } catch (err) {
        console.error("Errore fetch live chat session:", err);
      }
    };

    fetchSession();
    const interval = setInterval(fetchSession, 1200);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isOpen, resolvedSessionId]);

  // Scroll automatico in basso ai nuovi messaggi
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  // Focus automatico sull'input all'apertura
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isSending) return;

    const text = inputText.trim();
    setInputText("");
    setIsSending(true);

    // Optimistic UI
    const optimisticMsg: LiveChatMessage = {
      id: `opt_${Date.now()}`,
      senderRole: "barber",
      senderName: "Tu (Barbiere)",
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const res = await sendLiveChatMessage({
        sessionId: resolvedSessionId,
        senderRole: "barber",
        senderName: "Barbiere",
        content: text,
      });

      if (res.session) {
        setSession(res.session);
        setMessages(res.session.messages || []);
      }
    } catch (err) {
      console.error("Errore invio messaggio barbiere:", err);
    } finally {
      setIsSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleReleaseToAI = async () => {
    if (isReleasing) return;
    setIsReleasing(true);
    try {
      await setBarberActiveStatus(resolvedSessionId, false);
      if (onRelease) {
        onRelease();
      } else {
        onClose();
      }
    } catch (err) {
      console.error("Errore rilascio sessione all'AI:", err);
    } finally {
      setIsReleasing(false);
    }
  };

  const waLink =
    directWhatsAppUrl ||
    (cleanPhone
      ? `https://wa.me/${cleanPhone.startsWith("39") ? cleanPhone : `39${cleanPhone}`}?text=${encodeURIComponent(
          `💈 Ciao ${clientName || ""}, sono Roberto di Barbershop Roberto Baccaro! Ho preso in carico la tua richiesta.`
        )}`
      : null);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-zinc-950 border border-amber-500/30 rounded-3xl shadow-2xl flex flex-col h-[90vh] max-h-[720px] overflow-hidden">
        {/* Header Modal */}
        <div className="px-4 py-3.5 sm:px-6 sm:py-4 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
              <Scissors className="w-5 h-5" />
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-zinc-950 animate-ping" />
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-zinc-950" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-zinc-100 truncate">
                  Chat con {clientName || "Cliente"}
                </h3>
                <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  Live Connesso
                </span>
              </div>
              <p className="text-xs text-zinc-400 truncate">
                {clientPhone ? `Tel: ${clientPhone}` : `Sessione: ${resolvedSessionId}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {waLink && (
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                title="Apri chat esterna su WhatsApp (opzionale)"
                className="px-2.5 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600 border border-emerald-500/40 text-emerald-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">WhatsApp</span>
                <ExternalLink className="w-3 h-3 opacity-60" />
              </a>
            )}

            {clientPhone && (
              <a
                href={`tel:${clientPhone.replace(/\s+/g, "")}`}
                title="Chiama telefonicamente il cliente"
                className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition"
              >
                <Phone className="w-4 h-4 text-emerald-400" />
              </a>
            )}

            <button
              type="button"
              onClick={onClose}
              title="Riduci a icona (la chat resta attiva)"
              className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Banner Informativo Modalità Live */}
        <div className="px-4 py-2 bg-emerald-950/40 border-b border-emerald-500/20 flex items-center justify-between text-[11px] text-emerald-300">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>I messaggi che invii appaiono istantaneamente sullo schermo del cliente.</span>
          </span>
          <button
            type="button"
            onClick={handleReleaseToAI}
            disabled={isReleasing}
            className="text-zinc-400 hover:text-amber-300 underline font-semibold flex items-center gap-1 transition disabled:opacity-50"
          >
            {isReleasing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RotateCcw className="w-3 h-3" />
            )}
            <span>Rilascia all&apos;AI</span>
          </button>
        </div>

        {/* Area Messaggi Scrollabile */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3 text-xs bg-zinc-950/60">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-500">
              <MessageSquare className="w-10 h-10 mb-2 opacity-30 text-amber-400" />
              <p className="font-semibold text-zinc-400">Nessun messaggio ancora scambiato.</p>
              <p className="text-[11px] mt-1 max-w-sm">
                Scrivi un messaggio qui sotto per avviare la conversazione in tempo reale con {clientName}.
              </p>
            </div>
          ) : (
            messages.map((m) => {
              if (m.senderRole === "system") {
                return (
                  <div key={m.id} className="flex justify-center my-2">
                    <span className="text-[11px] font-medium bg-zinc-900 border border-emerald-500/30 text-emerald-300 px-3 py-1 rounded-full shadow-sm">
                      {m.content}
                    </span>
                  </div>
                );
              }

              const isBarberSender = m.senderRole === "barber";
              const isAssistant = m.senderRole === "assistant";

              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${isBarberSender ? "items-end" : "items-start"} animate-in fade-in duration-150`}
                >
                  <div className={`flex gap-2 max-w-[85%] ${isBarberSender ? "flex-row-reverse" : "flex-row"}`}>
                    {!isBarberSender && (
                      <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 shrink-0">
                        {isAssistant ? <Scissors className="w-3.5 h-3.5 text-amber-400" /> : <User className="w-3.5 h-3.5 text-zinc-300" />}
                      </div>
                    )}

                    <div className="space-y-1">
                      <div className={`flex items-center gap-2 text-[10px] text-zinc-500 ${isBarberSender ? "justify-end" : "justify-start"}`}>
                        <span className="font-bold text-zinc-400">
                          {isBarberSender ? "Tu (Barbiere)" : m.senderName || clientName}
                        </span>
                        {m.timestamp && (
                          <span>
                            {new Date(m.timestamp).toLocaleTimeString("it-IT", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                      </div>

                      <div
                        className={`rounded-2xl p-3 text-xs shadow-md leading-relaxed ${
                          isBarberSender
                            ? "bg-amber-500 text-black font-semibold rounded-tr-sm"
                            : isAssistant
                            ? "bg-zinc-900 border border-amber-500/30 text-zinc-200 rounded-tl-sm"
                            : "bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-tl-sm"
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{m.content}</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Form per invio messaggi da parte del barbiere */}
        <form
          onSubmit={handleSendMessage}
          className="p-3 bg-zinc-900 border-t border-zinc-800 flex items-center gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={`Scrivi un messaggio a ${clientName}...`}
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-500/50"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || isSending}
            className="p-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:hover:bg-amber-500 text-black font-bold transition flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/20"
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

