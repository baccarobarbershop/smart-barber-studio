"use server";

import { createClient } from "@/lib/supabase/server";
import { format } from "date-fns";
import fs from "fs";
import path from "path";
import type { BusinessSettings, BarberService, WeeklySchedule, CalendarException } from "@/types/database";
import { DEFAULT_SERVICES, DEFAULT_WEEKLY_SCHEDULE } from "@/types/database";

function readLocalServices(): BarberService[] | null {
  try {
    const filePath = path.join(process.cwd(), "src", "data", "salon_services.json");
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.error("Errore lettura local services in getSalonPublicInfo:", err);
  }
  return null;
}

function readLocalContacts(): { salon_phone: string; whatsapp_phone: string } {
  try {
    const filePath = path.join(process.cwd(), "src", "data", "salon_contacts.json");
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.error("Errore lettura local contacts:", err);
  }
  return { salon_phone: "331 81 76 178", whatsapp_phone: "331 81 76 178" };
}

export interface SalonPublicInfo {
  services: BarberService[];
  weeklySchedule: WeeklySchedule;
  upcomingExceptions: CalendarException[];
  fidelityCardEnabled: boolean;
  fidelityRewardDescription: string;
  fidelityTargetPoints: number;
  basePriceCents: number;
  salonPhone: string;
  whatsappPhone: string;
  maxAdvanceDays: number;
}

export async function getSalonPublicInfo(): Promise<SalonPublicInfo> {
  const supabase = await createClient();
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const localContacts = readLocalContacts();
  let salonPhone = localContacts.salon_phone || "331 81 76 178";
  let whatsappPhone = localContacts.whatsapp_phone || "331 81 76 178";

  let services: BarberService[] = DEFAULT_SERVICES;
  const localServices = readLocalServices();
  if (localServices && localServices.length > 0) {
    services = localServices;
  }

  let weeklySchedule: WeeklySchedule = DEFAULT_WEEKLY_SCHEDULE;
  let fidelityCardEnabled = true;
  let fidelityRewardDescription = "Taglio Gratuito + Trattamento Barba";
  let fidelityTargetPoints = 10;
  let basePriceCents = 1800;
  let maxAdvanceDays = 14;

  try {
    const { data: settings } = await supabase
      .from("business_settings")
      .select("*")
      .limit(1)
      .single();

    if (settings) {
      if ((settings as any).salon_phone) salonPhone = (settings as any).salon_phone;
      if ((settings as any).whatsapp_phone) whatsappPhone = (settings as any).whatsapp_phone;
      if ((settings.daily_schedules as any)?._contacts?.salon_phone) {
        salonPhone = (settings.daily_schedules as any)._contacts.salon_phone;
      }
      if ((settings.daily_schedules as any)?._contacts?.whatsapp_phone) {
        whatsappPhone = (settings.daily_schedules as any)._contacts.whatsapp_phone;
      }
      if (typeof settings.max_advance_booking_days === "number") {
        maxAdvanceDays = settings.max_advance_booking_days;
      }
      if (Array.isArray(settings.services) && settings.services.length > 0) {
        services = settings.services as BarberService[];
      }
      if (settings.daily_schedules && Object.keys(settings.daily_schedules).length > 0) {
        weeklySchedule = settings.daily_schedules as WeeklySchedule;
      }
      if (typeof settings.fidelity_card_enabled === "boolean") {
        fidelityCardEnabled = settings.fidelity_card_enabled;
      }
      if (settings.fidelity_reward_description) {
        fidelityRewardDescription = settings.fidelity_reward_description;
      }
      if (typeof settings.fidelity_target_points === "number") {
        fidelityTargetPoints = settings.fidelity_target_points;
      }
      if (typeof settings.slot_price_cents === "number") {
        basePriceCents = settings.slot_price_cents;
      }
    }
  } catch (err) {
    console.error("Errore fetch salon settings in getSalonPublicInfo:", err);
  }

  let upcomingExceptions: CalendarException[] = [];
  try {
    const { data: excData } = await supabase
      .from("calendar_exceptions")
      .select("*")
      .gte("exception_date", todayStr)
      .order("exception_date", { ascending: true })
      .limit(5);

    if (excData) {
      upcomingExceptions = excData as CalendarException[];
    }
  } catch (err) {
    console.error("Errore fetch exceptions in getSalonPublicInfo:", err);
  }

  return {
    services,
    weeklySchedule,
    upcomingExceptions,
    fidelityCardEnabled,
    fidelityRewardDescription,
    fidelityTargetPoints,
    basePriceCents,
    salonPhone,
    whatsappPhone,
    maxAdvanceDays,
  };
}

