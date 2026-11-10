"use client";

import { useState } from "react";
import {
  Scissors,
  Phone,
  ArrowRight,
  Loader2,
  Sparkles,
  CheckCircle2,
  Lock,
  User,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { loginCustomerDirectly } from "@/app/actions/auth";
import { PrivacyPolicyModal } from "@/components/legal/PrivacyPolicyModal";

interface CustomerPhoneLoginProps {
  onLoginSuccess: (customer: { phone: string; name: string; fidelityPoints: number }) => void;
  onOpenSalonInfo?: (tab: "services" | "hours") => void;
}

export function CustomerPhoneLogin({
  onLoginSuccess,
  onOpenSalonInfo,
}: CustomerPhoneLoginProps) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const handleDirectLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length < 2) {
      setErrorMessage("Inserisci il tuo Nome e Cognome per accedere.");
      return;
    }

    const clean = phone.trim();
    if (!clean || clean.replace(/\D/g, "").length < 6) {
      setErrorMessage("Inserisci un numero di cellulare valido.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await loginCustomerDirectly(clean, trimmedName);
      if (!res.success || !res.customer) {
        setErrorMessage(res.error || "Impossibile accedere. Riprova.");
      } else {
        setSuccessNotice(`Benvenuto, ${res.customer.name}! Accesso in corso...`);
        if (typeof window !== "undefined") {
          localStorage.setItem("smart_barber_customer_phone", res.customer.phone);
          localStorage.setItem("smart_barber_customer_name", res.customer.name);
          window.dispatchEvent(new Event("storage"));
        }
        setTimeout(() => {
          onLoginSuccess(res.customer!);
        }, 500);
      }
    } catch {
      setErrorMessage("Errore di connessione. Riprova tra poco.");
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
        <p className="text-xs text-zinc-400 leading-relaxed max-w-xs mx-auto">
          Inserisci Nome e Cellulare per verificare gli orari disponibili in tempo reale, prenotare e accumulare punti fedeltà.
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

      <form onSubmit={handleDirectLogin} className="space-y-4 text-left">
        {/* Nome e Cognome */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-zinc-300 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-amber-400" />
              Nome e Cognome
            </span>
            <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">Richiesto</span>
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
            <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">Richiesto</span>
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
          <p className="text-[10px] text-zinc-500 flex items-center gap-1 pt-0.5">
            <ShieldCheck className="w-3 h-3 text-amber-400/80 shrink-0" />
            <span>Nessun SMS o codice: accesso rapido e sicuro in 1 secondo.</span>
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
          className="w-full py-3.5 px-4 rounded-xl font-bold bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 transition disabled:opacity-50 text-xs uppercase tracking-wider active:scale-[0.98]"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <span>Accedi e Prenota</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      {/* Consultazione libera Listino */}
      {onOpenSalonInfo && (
        <div className="pt-2 flex items-center justify-center text-xs">
          <button
            type="button"
            onClick={() => onOpenSalonInfo("services")}
            className="text-zinc-400 hover:text-amber-400 font-semibold flex items-center gap-1.5 transition py-1.5 px-3 rounded-xl bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800"
          >
            <Scissors className="w-3.5 h-3.5 text-amber-400" />
            <span>Consulta Listino Prezzi</span>
          </button>
        </div>
      )}

      {/* Opzioni secondarie: Accesso Staff */}
      <div className="pt-4 mt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-500">
        <span className="text-[11px] text-zinc-500">Accesso clienti riservato</span>

        <Link
          href="/admin/login"
          title="Accesso riservato al personale del salone"
          className="flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-amber-400 transition py-1 px-2 rounded-lg hover:bg-zinc-900"
        >
          <Lock className="w-3 h-3 text-zinc-400" />
          <span>Area Riservata</span>
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
