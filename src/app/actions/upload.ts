"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export interface UploadResult {
  success: boolean;
  publicUrl?: string;
  error?: string;
}

/**
 * Server Action per l'upload sicuro della foto di esempio per il taglio (Lookbook).
 * Bypassa i limiti RLS per consentire il caricamento anche a clienti guest (non registrati).
 */
export async function uploadLookbookImage(formData: FormData): Promise<UploadResult> {
  try {
    const file = formData.get("file") as File | null;
    if (!file) {
      return { success: false, error: "Nessun file selezionato." };
    }

    // Validazione tipo file
    if (!file.type.startsWith("image/")) {
      return { success: false, error: "Il file deve essere un'immagine valida (JPEG, PNG, WEBP)." };
    }

    // Validazione dimensione (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return { success: false, error: "L'immagine non deve superare i 10MB." };
    }

    const adminClient = createAdminClient();
    const fileExt = (file.name || "photo.jpg").split(".").pop() || "jpg";
    const fileName = `lookbook_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { data, error } = await adminClient.storage
      .from("lookbook")
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (error) {
      console.error("Errore storage upload lookbook:", error);
      return { success: false, error: "Impossibile salvare l'immagine nel cloud: " + error.message };
    }

    const { data: urlData } = adminClient.storage
      .from("lookbook")
      .getPublicUrl(data.path);

    return {
      success: true,
      publicUrl: urlData.publicUrl,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto";
    console.error("Errore server upload:", err);
    return { success: false, error: message };
  }
}

