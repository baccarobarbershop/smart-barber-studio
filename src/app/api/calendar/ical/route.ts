import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { format } from "date-fns";
import { verifyAdminSignedToken, constantTimeCompare } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * Endpoint iCal / Webcal per sincronizzare l'agenda del barbiere direttamente
 * con Google Calendar, Apple Calendar (iPhone/Mac), e Microsoft Outlook.
 * Protetto da token segreto (passato via query ?token=...) o da sessione Admin autenticata.
 */
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token");
    const adminCookie = req.cookies.get("smart_barber_admin_session")?.value;
    const isCookieValid = verifyAdminSignedToken(adminCookie);

    const expectedToken = process.env.ICAL_SECRET_TOKEN || "baccaro-ical-2026-auth";
    const isTokenValid = token ? constantTimeCompare(token, expectedToken) : false;

    if (!isCookieValid && !isTokenValid) {
      return new NextResponse("Accesso non autorizzato. Token iCal mancante o non valido.", {
        status: 401,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const adminClient = createAdminClient();

    // Recupera tutti gli appuntamenti attivi (confermati o completati)
    const { data: appointments, error } = await adminClient
      .from("appointments")
      .select("*")
      .neq("status", "cancelled")
      .order("appointment_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) {
      return new NextResponse("Errore caricamento calendario", { status: 500 });
    }

    const nowStamp = format(new Date(), "yyyyMMdd'T'HHmmss'Z'");

    const events = (appointments || []).map((apt) => {
      const cleanDate = apt.appointment_date.replace(/-/g, "");
      const cleanStart = (apt.start_time || "09:00:00").replace(/:/g, "").substring(0, 6);
      const cleanEnd = (apt.end_time || "09:30:00").replace(/:/g, "").substring(0, 6);

      const dtStart = `${cleanDate}T${cleanStart}`;
      const dtEnd = `${cleanDate}T${cleanEnd}`;

      const isBlock =
        apt.customer_phone === "BLOCCATO" ||
        apt.customer_name?.startsWith("⛔");

      const summary = isBlock
        ? `${apt.customer_name || "⛔ Blocco Barbiere"}`
        : `💈 ${apt.customer_name} (${((apt.price_cents || 2500) / 100).toFixed(0)}€)`;

      const description = [
        `Cliente: ${apt.customer_name}`,
        `Telefono: ${apt.customer_phone || "Non fornito"}`,
        `Durata: ${apt.duration_minutes || 30} minuti`,
        `Stato Pagamento: ${apt.payment_status === "paid" ? "Pagato in App" : "Da pagare in salone"}`,
        apt.notes ? `Note: ${apt.notes}` : "",
      ]
        .filter(Boolean)
        .join("\\n");

      return [
        "BEGIN:VEVENT",
        `UID:apt-${apt.id}@smartbarber.local`,
        `DTSTAMP:${nowStamp}`,
        `DTSTART:${dtStart}`,
        `DTEND:${dtEnd}`,
        `SUMMARY:${summary.replace(/,/g, "\\,")}`,
        `DESCRIPTION:${description.replace(/,/g, "\\,")}`,
        "STATUS:CONFIRMED",
        "END:VEVENT",
      ].join("\r\n");
    });

    const icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Barbershop Roberto Baccaro//Agenda Salone//IT",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:Barbershop Roberto Baccaro",
      "X-WR-CALDESC:Calendario Appuntamenti in Salone",
      "X-WR-TIMEZONE:Europe/Rome",
      ...events,
      "END:VCALENDAR",
    ].join("\r\n");

    return new NextResponse(icsContent, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="smart-barber-agenda.ics"',
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (err: unknown) {
    console.error("Errore generazione iCal:", err);
    return new NextResponse("Errore interno generazione calendario", { status: 500 });
  }
}

