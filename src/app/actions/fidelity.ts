"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export interface FidelityCardInfo {
  customerName: string;
  phone: string;
  fidelityPoints: number;
  targetPoints: number;
  rewardDescription: string;
  isUnlocked: boolean;
  pointsRemaining: number;
  isEnabled: boolean;
}

/**
 * Recupera lo stato della Carta Fedeltà per un cliente in base al suo numero di telefono.
 */
export async function getCustomerFidelityCard(
  phone: string
): Promise<{ success: boolean; card?: FidelityCardInfo; error?: string }> {
  if (!phone || phone.trim().length < 6) {
    return { success: false, error: "Numero di telefono non valido." };
  }

  const adminClient = createAdminClient();
  const cleanPhone = phone.trim();

  // 1. Recupera impostazioni salone (target, descrizione premio e stato abilitazione)
  let targetPoints = 10;
  let rewardDescription = "Taglio Gratuito + Trattamento Barba";
  let isEnabled = true;

  try {
    const { data: settings } = await adminClient
      .from("business_settings")
      .select("*")
      .limit(1)
      .single();

    if (settings) {
      targetPoints = settings.fidelity_target_points ?? 10;
      rewardDescription = settings.fidelity_reward_description ?? "Taglio Gratuito + Trattamento Barba";
      isEnabled = settings.fidelity_card_enabled !== false;
    }
  } catch (e) {
    console.warn("Errore lettura settings fidelity:", e);
  }

  // 2. Recupera profilo cliente per telefono
  const { data: profile } = await adminClient
    .from("profiles")
    .select("full_name, phone, fidelity_points")
    .eq("phone", cleanPhone)
    .maybeSingle();

  if (!profile) {
    // Se il profilo non è ancora salvato con quel telefono esatto, cerca se ha già appuntamenti
    const { data: apt } = await adminClient
      .from("appointments")
      .select("customer_name")
      .eq("customer_phone", cleanPhone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const detectedName = apt?.customer_name || `Cliente VIP (${cleanPhone.slice(-4)})`;

    // Crea profilo guest per consentire l'accumulo fedeltà immediato
    const cleanDigits = cleanPhone.replace(/\D/g, "");
    const guestEmail = `guest_${cleanDigits}@smartbarber.local`;

    const { data: authUser } = await adminClient.auth.admin.createUser({
      email: guestEmail,
      email_confirm: true,
      user_metadata: {
        full_name: detectedName,
        phone: cleanPhone,
        role: "client",
      },
    });

    if (authUser?.user) {
      await adminClient.from("profiles").upsert({
        id: authUser.user.id,
        full_name: detectedName,
        phone: cleanPhone,
        role: "client",
        fidelity_points: 0,
      });
    }

    return {
      success: true,
      card: {
        customerName: detectedName,
        phone: cleanPhone,
        fidelityPoints: 0,
        targetPoints,
        rewardDescription,
        isUnlocked: false,
        pointsRemaining: targetPoints,
        isEnabled,
      },
    };
  }

  const points = profile.fidelity_points ?? 0;
  const isUnlocked = points >= targetPoints;
  const pointsRemaining = Math.max(0, targetPoints - points);

  return {
    success: true,
    card: {
      customerName: profile.full_name,
      phone: profile.phone,
      fidelityPoints: points,
      targetPoints,
      rewardDescription,
      isUnlocked,
      pointsRemaining,
      isEnabled,
    },
  };
}

