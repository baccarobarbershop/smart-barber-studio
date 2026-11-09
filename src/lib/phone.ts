/**
 * Utility per la normalizzazione dei numeri telefonici italiani e internazionali
 */
export function normalizePhoneDigits(phone: string | null | undefined): string {
  if (!phone) return "";
  let digits = phone.replace(/\D/g, "");
  // Se inizia con prefisso internazionale italiano 39 ed è più lungo di 10 cifre
  if (digits.startsWith("39") && digits.length > 10) {
    digits = digits.slice(2);
  }
  return digits;
}

