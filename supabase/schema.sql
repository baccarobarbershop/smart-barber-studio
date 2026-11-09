-- ==============================================================================
-- SMART BARBER APP - SUPABASE DATABASE SCHEMA & RLS (COMPLETO E IDEMPOTENTE)
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. HELPER FUNCTIONS FOR SECURITY & ROLES
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. PROFILES TABLE (Agganciata a auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL, -- Telefono obbligatorio per identificazione e promemoria
  role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'admin')),
  fidelity_points INTEGER NOT NULL DEFAULT 0 CHECK (fidelity_points >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Trigger per auto-popolamento profilo alla registrazione tramite Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Nuovo Cliente'),
    COALESCE(NEW.raw_user_meta_data->>'phone', 'Da completare'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'client')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. BUSINESS SETTINGS (Configurazione globale salone modificabile dall'Admin)
CREATE TABLE IF NOT EXISTS public.business_settings (
  id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  slot_duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (slot_duration_minutes IN (15, 20, 30, 45, 60)),
  working_days INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5,6}', -- 1: Lunedì, 6: Sabato, 0: Domenica
  opening_time TIME NOT NULL DEFAULT '09:00:00',
  closing_time TIME NOT NULL DEFAULT '19:30:00',
  lunch_break_start TIME DEFAULT '13:00:00',
  lunch_break_end TIME DEFAULT '14:30:00',
  daily_schedules JSONB, -- Orari personalizzati per singolo giorno della settimana
  human_handoff_timeout_seconds INTEGER NOT NULL DEFAULT 180, -- 3 minuti di timeout operatore
  -- Configurazione Fidelity Card & Premi
  fidelity_target_points INTEGER NOT NULL DEFAULT 10, -- Numero di appuntamenti necessari per il premio
  fidelity_reward_description TEXT NOT NULL DEFAULT 'Taglio Gratuito + Trattamento Barba', -- Descrizione premio personalizzabile
  fidelity_discount_percentage NUMERIC(5,2) NOT NULL DEFAULT 100.00, -- Percentuale sconto applicata al raggiungimento
  -- Pagamenti in App (Stripe) e in Salone
  slot_price_cents INTEGER NOT NULL DEFAULT 2500, -- 25,00 € costo default servizio
  allow_in_app_payment BOOLEAN NOT NULL DEFAULT TRUE,
  allow_in_person_payment BOOLEAN NOT NULL DEFAULT TRUE,
  stripe_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Inserimento record di default (singleton pattern)
INSERT INTO public.business_settings (id)
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Aggiunta colonna orari settimanali personalizzati e interruttore fidelity card se tabella già esistente
ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS daily_schedules JSONB;
ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS fidelity_card_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS services JSONB;
ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS min_cancellation_hours INTEGER NOT NULL DEFAULT 2;
ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS max_advance_booking_days INTEGER NOT NULL DEFAULT 14;
ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS enable_barber_daily_agenda_whatsapp BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS barber_agenda_whatsapp_phone TEXT;
ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS enable_new_booking_sound BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS internal_notes TEXT;

-- 5. CALENDAR EXCEPTIONS (Feste, Chiusure/Aperture straordinarie)
CREATE TABLE IF NOT EXISTS public.calendar_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exception_date DATE NOT NULL UNIQUE,
  is_closed BOOLEAN NOT NULL DEFAULT TRUE,
  custom_opening_time TIME,
  custom_closing_time TIME,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. APPOINTMENTS (Appuntamenti confermati e storicizzati)
CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  appointment_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'completed', 'cancelled', 'no_show')),
  lookbook_image_url TEXT,
  notes TEXT,
  points_awarded INTEGER NOT NULL DEFAULT 1,
  -- Modalità di Pagamento (In Salone o Subito in App)
  payment_method TEXT NOT NULL DEFAULT 'in_person' CHECK (payment_method IN ('in_person', 'in_app')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'refunded')),
  price_cents INTEGER NOT NULL DEFAULT 2500,
  stripe_payment_intent_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indice unico anti-overbooking: impedisce slot doppi concorrenti sullo stesso orario
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_slot 
  ON public.appointments (appointment_date, start_time) 
  WHERE status = 'confirmed';

-- 7. URGENT ALERTS (Allarmi bloccanti e notifiche con acknowledge)
CREATE TABLE IF NOT EXISTS public.urgent_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('urgent_cancellation', 'urgent_reschedule', 'new_booking', 'human_support_request')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged')),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 8. CONVERSATIONS & HUMAN HANDOFF
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  ai_paused BOOLEAN NOT NULL DEFAULT FALSE,
  ai_paused_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 9. REALTIME (Supabase Realtime per dashboard allarmi e calendario)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'urgent_alerts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.urgent_alerts;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'appointments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;
END $$;

-- 10. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.urgent_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Policy Profiles
DROP POLICY IF EXISTS "Profiles: Users can read own profile" ON public.profiles;
CREATE POLICY "Profiles: Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "Profiles: Users can update own profile" ON public.profiles;
CREATE POLICY "Profiles: Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id OR public.is_admin());

-- Policy Business Settings
DROP POLICY IF EXISTS "BusinessSettings: Public read" ON public.business_settings;
CREATE POLICY "BusinessSettings: Public read"
  ON public.business_settings FOR SELECT
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "BusinessSettings: Admin update" ON public.business_settings;
CREATE POLICY "BusinessSettings: Admin update"
  ON public.business_settings FOR UPDATE
  TO authenticated
  USING (public.is_admin());

-- Policy Calendar Exceptions
DROP POLICY IF EXISTS "CalendarExceptions: Public read" ON public.calendar_exceptions;
CREATE POLICY "CalendarExceptions: Public read"
  ON public.calendar_exceptions FOR SELECT
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "CalendarExceptions: Admin manage" ON public.calendar_exceptions;
CREATE POLICY "CalendarExceptions: Admin manage"
  ON public.calendar_exceptions FOR ALL
  TO authenticated
  USING (public.is_admin());

-- Policy Appointments
DROP POLICY IF EXISTS "Appointments: Read own or admin read all" ON public.appointments;
CREATE POLICY "Appointments: Read own or admin read all"
  ON public.appointments FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Appointments: Insert own or admin" ON public.appointments;
CREATE POLICY "Appointments: Insert own or admin"
  ON public.appointments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Appointments: Update own or admin" ON public.appointments;
CREATE POLICY "Appointments: Update own or admin"
  ON public.appointments FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

-- Policy Urgent Alerts
DROP POLICY IF EXISTS "UrgentAlerts: Admin can view all alerts" ON public.urgent_alerts;
CREATE POLICY "UrgentAlerts: Admin can view all alerts"
  ON public.urgent_alerts FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "UrgentAlerts: Insert permitted for system/authenticated users" ON public.urgent_alerts;
CREATE POLICY "UrgentAlerts: Insert permitted for system/authenticated users"
  ON public.urgent_alerts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "UrgentAlerts: Admin can acknowledge" ON public.urgent_alerts;
CREATE POLICY "UrgentAlerts: Admin can acknowledge"
  ON public.urgent_alerts FOR UPDATE
  TO authenticated
  USING (public.is_admin());

-- Policy Conversations
DROP POLICY IF EXISTS "Conversations: Users manage own conversation, admin can view/manage all" ON public.conversations;
CREATE POLICY "Conversations: Users manage own conversation, admin can view/manage all"
  ON public.conversations FOR ALL
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

-- 11. STORAGE BUCKET LOOKBOOK (Reference foto tagli)
INSERT INTO storage.buckets (id, name, public)
VALUES ('lookbook', 'lookbook', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Lookbook: Authenticated users can upload lookbook reference" ON storage.objects;
CREATE POLICY "Lookbook: Authenticated users can upload lookbook reference"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'lookbook');

DROP POLICY IF EXISTS "Lookbook: Public view" ON storage.objects;
CREATE POLICY "Lookbook: Public view"
  ON storage.objects FOR SELECT
  TO authenticated, anon
  USING (bucket_id = 'lookbook');
