"use server";

import { getAvailableSlots, type DayAvailability } from "@/lib/booking/slots";

export async function fetchDayAvailability(dateString: string): Promise<DayAvailability> {
  return await getAvailableSlots(dateString);
}

