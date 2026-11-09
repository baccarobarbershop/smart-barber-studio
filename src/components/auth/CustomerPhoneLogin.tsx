"use client";

import { useState } from "react";
import { Scissors, Phone, KeyRound, ArrowRight, Loader2, Sparkles, CheckCircle2, RotateCcw, Lock, User, MessageSquare, ExternalLink, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { sendCustomerOtp, verifyCustomerOtp } from "@/app/actions/auth";
import { PrivacyPolicyModal } from "@/components/legal/PrivacyPolicyModal";

interface CustomerPhoneLoginProps {
  onLoginSuccess: (customer: { phone: string; name: string; fidelityPoints: number }) => void;
  onOpenSalonInfo?: (tab: "services" | "hours") => void;
}

export function CustomerPhoneLogin({
  onLoginSuccess,
  onOpenSalonInfo,
}: CustomerPhoneLoginProps) {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [simulatedOtp, setSimulatedOtp] = useState<string | null>(null);
  const [directWhatsAppUrl, setDirectWhatsAppUrl] = useState<string | null>(null);
  const [sentViaApi, setSentViaApi] = useState<boolean>(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);

    if (!name.trim() || name.trim().length < 2) {
      setErrorMessage("Il Nome e Cognome è necessario per accedere e prenotare.");
      return;
    }

    const clean = phone.trim();
    if (!clean || clean.replace(/\D/g, "").length < 6) {
      setErrorMessage("Inserisci un numero di cellulare valido.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await sendCustomerOtp(clean, name);
      if (!res.success) {
        setErrorMessage(res.error || "Impossibile inviare la notifica su WhatsApp. Riprova.");
      } else {
        setSimulatedOtp(res.simulatedOtp || "123456");
        setDirectWhatsAppUrl(res.directWhatsAppUrl || null);
        setSentViaApi(!!res.sentViaApi);
        setStep("otp");
      }
    } catch {
      setErrorMessage("Errore di connessione. Riprova tra poco.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!otp.trim() || otp.trim().length < 4) {
      setErrorMessage("Inserisci il codice di conferma a 6 cifre.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await verifyCustomerOtp(phone, otp, name);
      if (!res.success || !res.customer) {
        setErrorMessage(res.error || "Codice non valido o scaduto.");
      } else {
        setSuccessNotice("Accesso completato con successo! Benvenuto.");
        if (typeof window !== "undefined") {
          localStorage.setItem("smart_barber_customer_phone", res.customer.phone);
          localStorage.setItem("smart_barber_customer_name", res.customer.name);
          window.dispatchEvent(new Event("storage"));
        }
        setTimeout(() => {
          onLoginSuccess(res.customer!);
        }, 600);
      }
    } catch {
      setErrorMessage("Errore durante la verifica del codice.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto glass-panel-gold rounded-3xl p-6 sm:p-8 text-center space-y-6 relative shadow-2xl border border-amber-500/30 animate-in fade-in zoom-in-95 duration-300">
      {/* Luxury Barber Icon */}
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-400 text-3xl mx-auto shadow-inner shadow-amber-500/20">
        <Scissors className="w-8 h-8" />
      </div>

      <div className="space-y-1.5">
        <span className="text-[11px] uppercase tracking-widest text-amber-400 font-extrabold flex items-center justify-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" />
          Smart Barber Studio
        </span>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-100">
          Area <span className="gold-gradient-text">Cliente Esclusivo</span>
        </h1>
        <p className="text-xs text-zinc-400 leading-relaxed">
          {step === "phone"
            ? "Inserisci il tuo Nome e Cellulare per ricevere il codice gratuito su WhatsApp ed accedere a orari, appuntamenti e vantaggi fedeltà."
            : `Ciao ${name}, abbiamo predisposto il tuo codice di verifica gratuito per il numero ${phone}`}
        </p>
      </div>

      {errorMessage && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs animate-in shake">
          {errorMessage}
        </div>
      )}

      {successNotice && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{successNotice}</span>
        </div>
      )}

      {step === "phone" ? (
        /* STEP 1: Inserimento Nome e Numero di Telefono */
        <form onSubmit={handleSendOtp} className="space-y-4 text-left">
          {/* Nome e Cognome */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-amber-400" />
                Nome e Cognome
              </span>
              <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">Necessario</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Es. Mario Rossi"
              className="w-full px-4 py-3 rounded-xl bg-zinc-900/90 border border-zinc-700/80 focus:border-amber-500 focus:outline-none text-zinc-100 text-sm placeholder:text-zinc-500 transition"
            />
          </div>

          {/* Numero di Cellulare */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-amber-400" />
                Numero di Cellulare
              </span>
              <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">Necessario</span>
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3.5 text-zinc-400 font-bold text-xs pointer-events-none select-none">
                +39
              </div>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Es. 347 123 4567"
                className="w-full pl-12 pr-4 py-3 rounded-xl bg-zinc-900/90 border border-zinc-700/80 focus:border-amber-500 focus:outline-none text-zinc-100 font-mono text-sm placeholder:text-zinc-500 transition"
              />
            </div>
            <p className="text-[10px] text-zinc-400 flex items-center gap-1.5 pt-0.5">
              <MessageSquare className="w-3 h-3 text-emerald-400 shrink-0" />
              <span>Ricevi il codice di verifica gratuito direttamente su WhatsApp.</span>
            </p>
          </div>

          {/* Dicitura Informativa Privacy & Consenso GDPR */}
          <div className="text-[11px] text-zinc-400 text-center leading-relaxed px-1">
            <span>Accedendo confermi di aver letto l&apos;</span>
            <button
              type="button"
              onClick={() => setIsPrivacyOpen(true)}
              className="text-amber-400 hover:text-amber-300 underline font-semibold transition inline-flex items-center gap-1 ml-1"
            >
              <span>Informativa Privacy (GDPR)</span>
            </button>
            <span> e autorizzi il trattamento dei dati per la prenotazione.</span>
          </div>

          <button
            type="submit"
            disabled={isLoading || !name.trim() || !phone.trim()}
            className="w-full py-3.5 px-4 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 transition disabled:opacity-50 text-xs uppercase tracking-wider active:scale-[0.98]"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <MessageSquare className="w-4 h-4" />
                <span>Invia Codice su WhatsApp</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      ) : (
        /* STEP 2: Inserimento Codice di Verifica WhatsApp */
        <form onSubmit={handleVerifyOtp} className="space-y-4 text-left">
          {/* Banner Stato Invio Codice */}
          {sentViaApi ? (
            <div className="p-4 rounded-2xl bg-emerald-950/60 border border-emerald-500/50 text-emerald-200 text-xs space-y-2 shadow-sm animate-in fade-in">
              <div className="flex items-center gap-2 font-bold text-[13px] text-emerald-300">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                <MessageSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Messaggio inviato su WhatsApp!</span>
              </div>
              <p className="text-zinc-300 text-xs leading-relaxed">
                Abbiamo appena inviato il codice di sicurezza ufficiale al tuo numero <strong className="text-emerald-400 font-mono">+39 {phone}</strong>.
              </p>
              <p className="text-[11px] text-zinc-400 pt-1 border-t border-emerald-500/20">
                Apri l&apos;applicazione WhatsApp sul tuo telefono e digita qui sotto il codice a 6 cifre ricevuto.
              </p>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 text-xs space-y-3 shadow-sm">
              <div className="flex items-center justify-between font-bold text-[12px]">
                <span className="flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Codice OTP per {name}:</span>
                </span>
                {simulatedOtp && (
                  <span className="font-mono bg-emerald-400 text-zinc-950 px-2.5 py-1 rounded-lg text-sm font-black tracking-widest shadow">
                    {simulatedOtp}
                  </span>
                )}
              </div>

              {simulatedOtp && (
                <button
                  type="button"
                  onClick={() => setOtp(simulatedOtp)}
                  className="w-full py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold flex items-center justify-center gap-1.5 transition shadow active:scale-[0.98]"
                >
                  <span>⚡ Inserisci codice in 1 click ({simulatedOtp})</span>
                </button>
              )}

              <div className="pt-1 border-t border-emerald-500/20 text-[11px] text-zinc-300 space-y-1.5">
                <p className="text-zinc-400 text-[10px]">
                  Modalità sviluppo / test rapido: inserisci il codice sopra oppure aprilo su WhatsApp:
                </p>
                {directWhatsAppUrl && (
                  <a
                    href={directWhatsAppUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-1.5 px-3 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Apri WhatsApp Web / App (+39 {phone})</span>
                  </a>
                )}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                Codice di Verifica
              </label>
              <button
                type="button"
                onClick={() => {
                  setStep("phone");
                  setErrorMessage(null);
                }}
                className="text-[10px] text-zinc-400 hover:text-amber-400 underline transition"
              >
                Modifica numero
              </button>
            </div>

            <input
              type="text"
              required
              autoFocus
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              className="w-full text-center tracking-[0.4em] font-mono text-xl py-3 rounded-xl bg-zinc-900/90 border border-zinc-700/80 focus:border-amber-500 focus:outline-none text-amber-400 font-black placeholder:text-zinc-600 transition"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || otp.length < 4}
            className="w-full py-3.5 px-4 rounded-xl font-bold bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 transition disabled:opacity-50 text-xs uppercase tracking-wider active:scale-[0.98]"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Conferma ed Entra</span>
              </>
            )}
          </button>

          <div className="flex justify-center pt-1">
            <button
              type="button"
              onClick={() => handleSendOtp()}
              disabled={isLoading}
              className="text-[11px] text-zinc-500 hover:text-amber-400 transition flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Non hai ricevuto il messaggio? Reinvia su WhatsApp</span>
            </button>
          </div>
        </form>
      )}

      {/* Consultazione libera Listino & Orari */}
      {onOpenSalonInfo && (
        <div className="pt-2 flex items-center justify-center gap-3 text-xs">
          <button
            type="button"
            onClick={() => onOpenSalonInfo("services")}
            className="text-zinc-400 hover:text-amber-400 font-semibold flex items-center gap-1.5 transition py-1 px-2.5 rounded-lg bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800"
          >
            <Scissors className="w-3 h-3 text-amber-400" />
            <span>Listino Prezzi</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenSalonInfo("hours")}
            className="text-zinc-400 hover:text-amber-400 font-semibold flex items-center gap-1.5 transition py-1 px-2.5 rounded-lg bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800"
          >
            <span>Orari del Salone</span>
          </button>
        </div>
      )}

      {/* Opzioni secondarie: Accesso Staff */}
      <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-500">
        <span className="text-[11px] text-zinc-500">Accesso clienti riservato</span>

        <Link
          href="/admin/login"
          title="Accesso riservato al personale del salone"
          className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-amber-400 transition"
        >
          <Lock className="w-3 h-3 text-zinc-400" />
          <span>Area Salone</span>
        </Link>
      </div>

      {/* Modal Informativa Privacy GDPR */}
      <PrivacyPolicyModal
        isOpen={isPrivacyOpen}
        onClose={() => setIsPrivacyOpen(false)}
      />
    </div>
  );
}
