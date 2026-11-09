import { BookingView } from "@/components/booking/BookingView";
import { getAvailableSlots } from "@/lib/booking/slots";
import { createAdminClient } from "@/lib/supabase/admin";
import { format } from "date-fns";

export const metadata = {
  title: "Prenota Appuntamento | Smart Barber Studio",
  description: "Seleziona data e orario per il tuo taglio esclusivo.",
};

export default async function BookPage() {
  const todayStr = format(new Date(), "yyyy-MM-dd");
  let initialAvailability = undefined;
  let maxAdvanceDays = 14;

  try {
    const adminClient = createAdminClient();
    const [{ data: settings }, avail] = await Promise.all([
      adminClient.from("business_settings").select("max_advance_booking_days").limit(1).single(),
      getAvailableSlots(todayStr),
    ]);
    if (settings?.max_advance_booking_days) {
      maxAdvanceDays = settings.max_advance_booking_days;
    }
    initialAvailability = avail;
  } catch (err) {
    console.error("Supabase SSR fetch fallback:", err);
  }

  return (
    <main className="min-h-screen py-8 px-2 flex flex-col justify-start sm:justify-center">
      <BookingView
        initialDate={todayStr}
        initialAvailability={initialAvailability}
        maxDays={maxAdvanceDays}
      />
    </main>
  );
}

