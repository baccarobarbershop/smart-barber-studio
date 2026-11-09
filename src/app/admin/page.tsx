import { getAdminSettings, fetchCalendarOverview } from "@/app/actions/admin";
import { fetchPendingAlerts } from "@/app/actions/alerts";
import { isAdminSession } from "@/app/actions/auth";
import { redirect } from "next/navigation";
import { AdminDashboardClient } from "@/components/admin/AdminDashboardClient";
import type { BusinessSettings, Appointment, UrgentAlert } from "@/types/database";

export const metadata = {
  title: "Dashboard Amministratore | Smart Barber Studio",
  description: "Gestione calendario, configurazione salone, carta fedeltà e allarmi in tempo reale.",
};

const defaultSettings: BusinessSettings = {
  id: "00000000-0000-0000-0000-000000000001",
  slot_duration_minutes: 30,
  working_days: [1, 2, 3, 4, 5, 6],
  opening_time: "09:00:00",
  closing_time: "19:30:00",
  lunch_break_start: "13:00:00",
  lunch_break_end: "14:30:00",
  human_handoff_timeout_seconds: 180,
  fidelity_target_points: 10,
  fidelity_reward_description: "Taglio Gratuito + Trattamento Barba",
  fidelity_discount_percentage: 100,
  slot_price_cents: 1800,
  allow_in_app_payment: true,
  allow_in_person_payment: true,
  stripe_enabled: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export default async function AdminPage() {
  const isAuth = await isAdminSession();
  if (!isAuth) {
    redirect("/admin/login");
  }

  const currentYear = new Date().getFullYear();
  let settings = defaultSettings;
  let appointments: Appointment[] = [];
  let pendingAlerts: UrgentAlert[] = [];

  try {
    const fetchedSettings = await getAdminSettings();
    if (fetchedSettings) settings = fetchedSettings;
    appointments = await fetchCalendarOverview({ year: currentYear });
    pendingAlerts = await fetchPendingAlerts();
  } catch (err) {
    console.error("Supabase SSR Admin fetch fallback:", err);
  }

  return (
    <main className="min-h-screen p-4 sm:p-8 max-w-6xl mx-auto space-y-6">
      <AdminDashboardClient
        initialSettings={settings}
        initialAppointments={appointments}
        initialAlerts={pendingAlerts}
      />
    </main>
  );
}
