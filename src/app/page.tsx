"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Sparkles, Calendar, Clock, Scissors, CalendarCheck, Lock, User, X } from "lucide-react";
import { ManageAppointmentModal } from "@/components/booking/ManageAppointmentModal";
import { CustomerPhoneLogin } from "@/components/auth/CustomerPhoneLogin";
import { SalonServicesAndHoursModal } from "@/components/salon/SalonServicesAndHoursModal";
import { PrivacyPolicyModal } from "@/components/legal/PrivacyPolicyModal";

export default function Home() {
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [isSalonModalOpen, setIsSalonModalOpen] = useState(false);
  const [salonModalTab, setSalonModalTab] = useState<"services" | "hours">("services");
  const [customerPhone, setCustomerPhone] = useState<string | null>(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedPhone = localStorage.getItem("smart_barber_customer_phone");
      setCustomerPhone(savedPhone);
    }
  }, []);

  return (
    <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Schermata Principale del Salone (Libera navigazione per tutti i clienti) */}
      <div className="max-w-md w-full glass-panel-gold rounded-3xl p-5 sm:p-8 text-center space-y-5 sm:space-y-6 relative z-10 shadow-2xl border border-amber-500/30 animate-in fade-in duration-300">
        
        {/* Luxury Badge & Logo */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-3xl mx-auto shadow-inner">
          <Scissors className="w-8 h-8" />
        </div>

        <div className="space-y-1.5">
          <span className="text-[11px] uppercase tracking-widest text-amber-400 font-extrabold">
            Barberia &quot;Dal 1958&quot; • Presso &quot;Wild Effect&quot;
          </span>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-zinc-100">
            Barbershop <span className="gold-gradient-text">Roberto Baccaro</span>
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
            C.so Orbassano 230/a, Torino • Tel. 331 81 76 178
            <br />
            <span className="text-zinc-500 text-xs">Orario 9:00 - 19:00 • Lunedì Chiuso • È gradito l&apos;appuntamento</span>
          </p>
        </div>

        {/* Stato Login / Tessera Fedeltà cliente */}
        <div className="pt-1 flex items-center justify-center">
          {customerPhone ? (
            <div className="inline-flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 py-1 px-3 rounded-full border border-amber-500/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Cliente riconosciuto ({customerPhone})</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsLoginModalOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-amber-400 py-1 px-3 rounded-full border border-zinc-800 hover:border-amber-500/30 bg-zinc-900/80 transition"
            >
              <User className="w-3.5 h-3.5 text-amber-400" />
              <span>Hai già una Tessera Fedeltà? Accedi</span>
            </button>
          )}
        </div>

        {/* Action Buttons */}
        <div className="space-y-3 pt-1">
          {/* 1. Assistente Virtuale Prenotazione */}
          <Link
            href="/chat"
            className="w-full py-4 px-5 rounded-2xl font-bold bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2.5 transition active:scale-[0.98] text-sm uppercase tracking-wider"
          >
            <Sparkles className="w-4 h-4" />
            <span>Prenota con Assistente Virtuale</span>
          </Link>

          {/* 2. Calendario Completo (14 Giorni) */}
          <Link
            href="/book"
            className="w-full py-3.5 px-5 rounded-2xl font-semibold bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 border border-zinc-700/80 flex items-center justify-center gap-2.5 transition text-xs"
          >
            <Calendar className="w-4 h-4 text-amber-400" />
            <span>Seleziona Data & Orario (14 Giorni)</span>
          </Link>

          {/* 3. Listino Prezzi & Orari Salone */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => {
                setSalonModalTab("services");
                setIsSalonModalOpen(true);
              }}
              className="py-3 px-3 rounded-2xl bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 hover:text-amber-300 border border-zinc-800 hover:border-amber-500/40 flex items-center justify-center gap-2 transition text-xs font-semibold shadow-sm"
            >
              <Scissors className="w-3.5 h-3.5 text-amber-400" />
              <span>Listino Prezzi</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSalonModalTab("hours");
                setIsSalonModalOpen(true);
              }}
              className="py-3 px-3 rounded-2xl bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 hover:text-amber-300 border border-zinc-800 hover:border-amber-500/40 flex items-center justify-center gap-2 transition text-xs font-semibold shadow-sm"
            >
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Orari Salone</span>
            </button>
          </div>

          {/* 4. Disdici o Sposta Appuntamento Esistente */}
          <button
            type="button"
            onClick={() => setIsManageModalOpen(true)}
            className="w-full py-3 px-5 rounded-2xl font-semibold bg-zinc-900 hover:bg-zinc-850 text-amber-300 border border-amber-500/30 flex items-center justify-center gap-2 transition text-xs"
          >
            <CalendarCheck className="w-3.5 h-3.5 text-amber-400" />
            <span>I Miei Appuntamenti / Disdici</span>
          </button>
        </div>

        {/* Footer info con privacy e lucchetto discreto per lo staff */}
        <div className="pt-4 mt-2 border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-500">
          <div>
            <button
              type="button"
              onClick={() => setIsPrivacyOpen(true)}
              className="hover:text-amber-400 transition text-zinc-400"
            >
              Informativa Privacy (GDPR)
            </button>
          </div>

          <div>
            <Link
              href="/admin/login"
              title="Accesso riservato al personale del salone"
              className="flex items-center gap-1.5 text-zinc-500 hover:text-amber-400 transition py-1 px-2 rounded-lg hover:bg-zinc-900"
            >
              <Lock className="w-3 h-3 text-zinc-400" />
              <span>Area Riservata</span>
            </Link>
          </div>
        </div>

      </div>

      {/* Modal Login Telefonico Cliente Opzionale */}
      {isLoginModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative max-w-md w-full">
            <button
              type="button"
              onClick={() => setIsLoginModalOpen(false)}
              className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-zinc-800 text-zinc-400 hover:text-zinc-100 flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
            <CustomerPhoneLogin
              onLoginSuccess={(c) => {
                setCustomerPhone(c.phone);
                setIsLoginModalOpen(false);
              }}
              onOpenSalonInfo={(tab) => {
                setIsLoginModalOpen(false);
                setSalonModalTab(tab);
                setIsSalonModalOpen(true);
              }}
            />
          </div>
        </div>
      )}

      {/* Modal Disdetta e Gestione Veloce */}
      <ManageAppointmentModal
        isOpen={isManageModalOpen}
        onClose={() => setIsManageModalOpen(false)}
      />

      {/* Modal Listino Prezzi & Orari Salone */}
      <SalonServicesAndHoursModal
        isOpen={isSalonModalOpen}
        onClose={() => setIsSalonModalOpen(false)}
        initialTab={salonModalTab}
      />

      {/* Modal Informativa Privacy GDPR */}
      <PrivacyPolicyModal
        isOpen={isPrivacyOpen}
        onClose={() => setIsPrivacyOpen(false)}
      />
    </main>
  );
}
