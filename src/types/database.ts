export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "client" | "admin";

export type AppointmentStatus = "confirmed" | "completed" | "cancelled" | "no_show";

export type PaymentStatus = "unpaid" | "paid" | "refunded";

export type PaymentMethod = "in_person" | "in_app";

export type AlertType =
  | "urgent_cancellation"
  | "urgent_reschedule"
  | "new_booking"
  | "human_support_request";

export type AlertStatus = "pending" | "acknowledged";

export interface Profile {
  id: string;
  full_name: string;
  phone: string;
  role: UserRole;
  fidelity_points: number;
  internal_notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DaySchedule {
  enabled: boolean;
  opening_time: string; // "09:00"
  closing_time: string; // "19:30"
  has_lunch_break: boolean;
  lunch_break_start: string | null; // "13:00"
  lunch_break_end: string | null; // "14:30"
}

export type WeeklySchedule = Record<number, DaySchedule>; // 0: Dom, 1: Lun, ..., 6: Sab

export const DEFAULT_WEEKLY_SCHEDULE: WeeklySchedule = {
  1: { enabled: false, opening_time: "09:00", closing_time: "19:00", has_lunch_break: false, lunch_break_start: null, lunch_break_end: null }, // Lunedì chiuso
  2: { enabled: true, opening_time: "09:00", closing_time: "19:00", has_lunch_break: false, lunch_break_start: null, lunch_break_end: null },
  3: { enabled: true, opening_time: "09:00", closing_time: "19:00", has_lunch_break: false, lunch_break_start: null, lunch_break_end: null },
  4: { enabled: true, opening_time: "09:00", closing_time: "19:00", has_lunch_break: false, lunch_break_start: null, lunch_break_end: null },
  5: { enabled: true, opening_time: "09:00", closing_time: "19:00", has_lunch_break: false, lunch_break_start: null, lunch_break_end: null },
  6: { enabled: true, opening_time: "09:00", closing_time: "19:00", has_lunch_break: false, lunch_break_start: null, lunch_break_end: null },
  0: { enabled: false, opening_time: "09:00", closing_time: "19:00", has_lunch_break: false, lunch_break_start: null, lunch_break_end: null }, // Domenica chiuso
};

export interface BarberService {
  id: string;
  name: string;
  price_cents: number;
  duration_minutes: number;
  description?: string;
  enabled: boolean;
}

export const DEFAULT_SERVICES: BarberService[] = [
  {
    id: "srv_taglio_shampoo",
    name: "Taglio + Shampoo",
    price_cents: 1800,
    duration_minutes: 30,
    description: "Taglio uomo con lavaggio shampoo, rifinitura e styling finale.",
    enabled: true,
  },
  {
    id: "srv_sopracciglia",
    name: "Sopracciglia",
    price_cents: 200,
    duration_minutes: 10,
    description: "Rifinitura e definizione delle sopracciglia.",
    enabled: true,
  },
  {
    id: "srv_pensionati_taglio_shampoo",
    name: "Pensionati Taglio + Shampoo",
    price_cents: 1500,
    duration_minutes: 30,
    description: "Taglio capelli e shampoo dedicato ai pensionati.",
    enabled: true,
  },
  {
    id: "srv_taglio_bimbo",
    name: "Taglio Bimbo (0-12 anni)",
    price_cents: 1000,
    duration_minutes: 20,
    description: "Taglio capelli per bambini fino a 12 anni.",
    enabled: true,
  },
  {
    id: "srv_rasatura_testa_macchinetta",
    name: "Rasatura uniforme con macchinetta",
    price_cents: 1000,
    duration_minutes: 20,
    description: "Rasatura uniforme della testa a macchinetta.",
    enabled: true,
  },
  {
    id: "srv_modellatura_barba",
    name: "Modellatura barba (e profili a rasoio)",
    price_cents: 1000,
    duration_minutes: 20,
    description: "Cura e modellatura della barba con rifinitura dei profili a rasoio.",
    enabled: true,
  },
  {
    id: "srv_rasatura_barba_tradizionale",
    name: "Rasatura barba tradizionale",
    price_cents: 1000,
    duration_minutes: 20,
    description: "Rasatura completa della barba con panno caldo e rasoio a mano libera.",
    enabled: true,
  },
  {
    id: "srv_rasatura_barba_macchinetta",
    name: "Rasatura barba uniforme con macchinetta",
    price_cents: 500,
    duration_minutes: 15,
    description: "Accorciatura e rasatura uniforme della barba con tagliacapelli a macchinetta.",
    enabled: true,
  },
];

export interface BusinessSettings {
  id: string;
  slot_duration_minutes: number;
  working_days: number[]; // 1 = Lunedì, 6 = Sabato, 0 = Domenica
  opening_time: string; // '09:00:00'
  closing_time: string; // '19:30:00'
  lunch_break_start: string | null; // '13:00:00'
  lunch_break_end: string | null; // '14:30:00'
  daily_schedules?: WeeklySchedule;
  human_handoff_timeout_seconds: number;
  fidelity_target_points: number;
  fidelity_reward_description: string;
  fidelity_discount_percentage: number;
  fidelity_card_enabled?: boolean;
  services?: BarberService[];
  salon_phone?: string;
  whatsapp_phone?: string;
  slot_price_cents: number;
  allow_in_app_payment: boolean;
  allow_in_person_payment: boolean;
  stripe_enabled: boolean;
  min_cancellation_hours?: number; // Preavviso minimo per disdetta online (es. 2 ore)
  max_advance_booking_days?: number; // Finestra massima di anticipo prenotazione (es. 14, 30 giorni)
  enable_barber_daily_agenda_whatsapp?: boolean; // Attiva il pulsante per inviare l'agenda del giorno/domani su WhatsApp al barbiere
  barber_agenda_whatsapp_phone?: string; // Numero WhatsApp del titolare dove ricevere l'agenda
  enable_new_booking_sound?: boolean; // Tocco sonoro discreto alla ricezione di una nuova prenotazione in tempo reale
  created_at: string;
  updated_at: string;
}

export interface CalendarException {
  id: string;
  exception_date: string; // YYYY-MM-DD
  is_closed: boolean;
  custom_opening_time: string | null;
  custom_closing_time: string | null;
  reason: string | null;
  created_at: string;
}

export interface Appointment {
  id: string;
  user_id: string;
  customer_name: string;
  customer_phone: string;
  appointment_date: string; // YYYY-MM-DD
  start_time: string; // HH:mm:ss
  end_time: string; // HH:mm:ss
  duration_minutes: number;
  status: AppointmentStatus;
  lookbook_image_url: string | null;
  notes: string | null;
  points_awarded: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  price_cents: number;
  stripe_payment_intent_id: string | null;
  created_at: string;
  updated_at: string;
  profile?: Profile;
}

export interface UrgentAlert {
  id: string;
  appointment_id: string | null;
  user_id: string;
  type: AlertType;
  title: string;
  message: string;
  status: AlertStatus;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  created_at: string;
  profile?: Profile;
  appointment?: Appointment;
}

export interface Conversation {
  id: string;
  user_id: string;
  ai_paused: boolean;
  ai_paused_at: string | null;
  created_at: string;
  updated_at: string;
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string; full_name: string; phone: string };
        Update: Partial<Profile>;
        Relationships: Array<{
          foreignKeyName: string;
          columns: string[];
          isOneToOne: boolean;
          referencedRelation: string;
          referencedColumns: string[];
        }>;
      };
      business_settings: {
        Row: BusinessSettings;
        Insert: Partial<BusinessSettings>;
        Update: Partial<BusinessSettings>;
        Relationships: Array<{
          foreignKeyName: string;
          columns: string[];
          isOneToOne: boolean;
          referencedRelation: string;
          referencedColumns: string[];
        }>;
      };
      calendar_exceptions: {
        Row: CalendarException;
        Insert: Partial<CalendarException> & { exception_date: string };
        Update: Partial<CalendarException>;
        Relationships: Array<{
          foreignKeyName: string;
          columns: string[];
          isOneToOne: boolean;
          referencedRelation: string;
          referencedColumns: string[];
        }>;
      };
      appointments: {
        Row: Appointment;
        Insert: Partial<Appointment> & {
          user_id: string;
          customer_name: string;
          customer_phone: string;
          appointment_date: string;
          start_time: string;
          end_time: string;
        };
        Update: Partial<Appointment>;
        Relationships: Array<{
          foreignKeyName: string;
          columns: string[];
          isOneToOne: boolean;
          referencedRelation: string;
          referencedColumns: string[];
        }>;
      };
      urgent_alerts: {
        Row: UrgentAlert;
        Insert: Partial<UrgentAlert> & {
          user_id: string;
          type: AlertType;
          title: string;
          message: string;
        };
        Update: Partial<UrgentAlert>;
        Relationships: Array<{
          foreignKeyName: string;
          columns: string[];
          isOneToOne: boolean;
          referencedRelation: string;
          referencedColumns: string[];
        }>;
      };
      conversations: {
        Row: Conversation;
        Insert: Partial<Conversation> & { user_id: string };
        Update: Partial<Conversation>;
        Relationships: Array<{
          foreignKeyName: string;
          columns: string[];
          isOneToOne: boolean;
          referencedRelation: string;
          referencedColumns: string[];
        }>;
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
