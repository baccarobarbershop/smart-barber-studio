import crypto from "crypto";

const DEFAULT_SECRET = "smart_barber_crypto_secret_luxury_key_2026";

function getSessionSecret(): string {
  return (
    process.env.ADMIN_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    DEFAULT_SECRET
  );
}

export interface AdminSessionPayload {
  role: "admin";
  iat: number;
  exp: number;
  nonce: string;
}

/**
 * Crea un token di sessione firmato crittograficamente con HMAC-SHA256.
 * Include timestamp di emissione e scadenza rigorosa (es. 24 ore).
 */
export function createAdminSignedToken(durationSeconds: number = 24 * 60 * 60): string {
  const now = Date.now();
  const payload: AdminSessionPayload = {
    role: "admin",
    iat: now,
    exp: now + durationSeconds * 1000,
    nonce: crypto.randomBytes(16).toString("hex"),
  };

  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", getSessionSecret())
    .update(data)
    .digest("base64url");

  return `${data}.${signature}`;
}

/**
 * Valida il token firmato verificando la firma crittografica con timingSafeEqual
 * e controllando la data di scadenza.
 */
export function verifyAdminSignedToken(token: string | undefined): boolean {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return false;
  }

  const [data, signature] = parts;

  // Calcola la firma attesa
  const expectedSignature = crypto
    .createHmac("sha256", getSessionSecret())
    .update(data)
    .digest("base64url");

  const sigBuffer = Buffer.from(signature);
  const expectedSigBuffer = Buffer.from(expectedSignature);

  // Verifica a tempo costante per prevenire attacchi di temporizzazione (timing attacks)
  if (
    sigBuffer.length !== expectedSigBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expectedSigBuffer)
  ) {
    return false;
  }

  // Verifica payload e scadenza
  try {
    const payloadStr = Buffer.from(data, "base64url").toString("utf-8");
    const payload: AdminSessionPayload = JSON.parse(payloadStr);

    if (payload.role !== "admin") {
      return false;
    }

    if (Date.now() > payload.exp) {
      return false; // Token scaduto
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Confronta due stringhe (es. PIN digitato e PIN configurato) a tempo costante.
 */
export function constantTimeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a.trim());
  const bufB = Buffer.from(b.trim());

  if (bufA.length !== bufB.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

