"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BusinessSettings, Appointment, UrgentAlert } from "@/types/database";
import { AdminCalendarMultiView } from "./AdminCalendarMultiView";
import { AdminSettingsView } from "./AdminSettingsView";
import { AdminFidelityClientsView } from "./AdminFidelityClientsView";
import { UrgentAlarmModal } from "./UrgentAlarmModal";
import { NewBookingNotificationListener } from "./NewBookingNotificationListener";
import { UnconfirmedPastAlertBanner } from "./UnconfirmedPastAlertBanner";
import { BookingModal } from "@/components/booking/BookingModal";
import { AdminLiveChatModal } from "./AdminLiveChatModal";
import { logoutAdmin } from "@/app/actions/auth";
import { Calendar, Settings, ShieldCheck, ArrowLeft, Award, LogOut, MessageSquare } from "lucide-react";
import Link from "next/link";

interface AdminDashboardClientProps {
  initialSettings: BusinessSettings;
  initialAppointments: Appointment[];
  initialAlerts: UrgentAlert[];
}

export function AdminDashboardClient({
  initialSettings,
  initialAppointments,
  initialAlerts,
}: AdminDashboardClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"calendar" | "fidelity" | "settings">("calendar");
  const [appointments, setAppointments] = useState<Appointment[]>(initialAppointments);
  const [settings, setSettings] = useState<BusinessSettings>(initialSettings);
  const [activeLiveChat, setActiveLiveChat] = useState<{
    isOpen: boolean;
    sessionId: string;
    clientName: string;
    clientPhone?: string;
    directWhatsAppUrl?: string;
  } | null>(null);

  const handleAdminLogout = async () => {
    await logoutAdmin();
    router.push("/");
    router.refresh();
  };

  // Walk-in modal state
  const [walkinState, setWalkinState] = useState<{
    isOpen: boolean;
    date: string;
    time: string;
  }>({
    isOpen: false,
    date: "",
    time: "",
  });

  const handleOpenWalkin = (date: string, time: string) => {
    setWalkinState({
      isOpen: true,
      date,
      time,
    });
  };

  return (
    <div className="space-y-6">
      {/* Notifica Acustica Discreta ("Ding / Chime") e Toast Realtime per Nuove Prenotazioni */}
      <NewBookingNotificationListener
        settings={settings}
        onNewAppointment={(newApt) => {
          setAppointments((prev) => {
            if (prev.some((a) => a.id === newApt.id)) return prev;
            return [...prev, newApt];
          });
        }}
      />

      {/* Sistema Realtime Allarmi Urgenti (Modal rosso + sirena acustica persistente) */}
      <UrgentAlarmModal
        initialAlerts={initialAlerts}
        onOpenLiveChat={(info) => {
          setActiveLiveChat({
            isOpen: true,
            ...info,
          });
        }}
      />

      {/* Live Chat Modal Operatore Barbiere in Tempo Reale */}
      {activeLiveChat && (
        <AdminLiveChatModal
          isOpen={activeLiveChat.isOpen}
          onClose={() => setActiveLiveChat((prev) => (prev ? { ...prev, isOpen: false } : null))}
          onRelease={() => setActiveLiveChat(null)}
          sessionId={activeLiveChat.sessionId}
          clientName={activeLiveChat.clientName}
          clientPhone={activeLiveChat.clientPhone}
          directWhatsAppUrl={activeLiveChat.directWhatsAppUrl}
        />
      )}

      {/* Pill Galleggiante se la chat è attiva ma ridotta a icona */}
      {activeLiveChat && !activeLiveChat.isOpen && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom duration-200">
          <button
            type="button"
            onClick={() => setActiveLiveChat((prev) => (prev ? { ...prev, isOpen: true } : null))}
            className="px-4 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-2xl flex items-center gap-2.5 transition border border-emerald-400/40"
          >
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
            </span>
            <MessageSquare className="w-4 h-4" />
            <span>Chat con {activeLiveChat.clientName} (In corso)</span>
          </button>
        </div>
      )}

      {/* Top Bar Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100 transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wider font-extrabold text-amber-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                Pannello Barbiere (Admin)
              </span>
            </div>
            <h1 className="text-2xl font-black text-zinc-100">
              Smart <span className="gold-gradient-text">Barber Studio</span>
            </h1>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 p-1 rounded-2xl text-[11px] sm:text-xs font-bold overflow-x-auto max-w-full no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab("calendar")}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl transition whitespace-nowrap ${
              activeTab === "calendar"
                ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span>Calendario</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("fidelity")}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl transition whitespace-nowrap ${
              activeTab === "fidelity"
                ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Award className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span>Tessere & Clienti</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("settings")}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl transition whitespace-nowrap ${
              activeTab === "settings"
                ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span>Orari & Regole</span>
          </button>

          <button
            type="button"
            onClick={handleAdminLogout}
            title="Esci dall'area riservata barbiere"
            className="p-1.5 sm:p-2 rounded-xl text-zinc-400 hover:text-red-400 hover:bg-zinc-800/80 transition shrink-0"
          >
            <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>
      </div>

      {/* Banner Intelligente: Rilevamento automatico appuntamenti passati da confermare/evadere */}
      <UnconfirmedPastAlertBanner />

      {/* Content Tabs */}
      {activeTab === "calendar" ? (
        <AdminCalendarMultiView
          initialAppointments={appointments}
          settings={settings}
          onOpenWalkin={handleOpenWalkin}
        />
      ) : activeTab === "fidelity" ? (
        <AdminFidelityClientsView settings={settings} />
      ) : (
        <AdminSettingsView initialSettings={settings} />
      )}

      {/* Walk-in Booking Modal per inserimento rapido barbiere */}
      {walkinState.isOpen && (
        <BookingModal
          isOpen={walkinState.isOpen}
          onClose={() => setWalkinState({ isOpen: false, date: "", time: "" })}
          date={walkinState.date}
          time={walkinState.time}
          onBookingSuccess={() => {
            // Ricarica la vista o aggiunge appuntamento
            setWalkinState({ isOpen: false, date: "", time: "" });
          }}
        />
      )}
    </div>
  );
}

