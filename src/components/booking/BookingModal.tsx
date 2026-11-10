"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { X, CheckCircle2, User, Phone, FileText, Image as ImageIcon, Loader2, CreditCard, Banknote, Scissors, MessageSquare } from "lucide-react";
import { bookAppointment } from "@/app/actions/booking";
import { uploadLookbookImage } from "@/app/actions/upload";
import { getSalonPublicInfo } from "@/app/actions/salon";
import { buildAppointmentWhatsAppUrl } from "@/lib/whatsapp";
import { PrivacyPolicyModal } from "@/components/legal/PrivacyPolicyModal";
import type { PaymentMethod, BarberService } from "@/types/database";
import { DEFAULT_SERVICES } from "@/types/database";

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  date: string; // "YYYY-MM-DD"
  time: string; // "HH:mm"
  initialCustomerName?: string;
  initialCustomerPhone?: string;
  initialServiceName?: string;
  onBookingSuccess?: (appointmentId: string) => void;
  closeButtonLabel?: string;
  autoCloseDelayMs?: number;
}

async function compressImageForUpload(file: File): Promise<File> {
  // Se non è un'immagine o è già inferiore a 600KB, non comprimere
  if (!file.type.startsWith("image/") || file.size < 600 * 1024) {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = (e.target?.result as string) || "";
    };

    img.onload = () => {
      const maxDim = 1600;
      let width = img.width;
      let height = img.height;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          const compressed = new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
            type: "image/jpeg",
            lastModified: Date.now(),
          });
          resolve(compressed);
        },
        "image/jpeg",
        0.82
      );
    };

    img.onerror = () => resolve(file);
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

export function BookingModal({
  isOpen,
  onClose,
  date,
  time,
  initialCustomerName = "",
  initialCustomerPhone = "",
  initialServiceName,
  onBookingSuccess,
  closeButtonLabel,
  autoCloseDelayMs,
}: BookingModalProps) {
  const [name, setName] = useState(initialCustomerName);
  const [phone, setPhone] = useState(initialCustomerPhone);
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("in_person");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);

  // Servizi disponibili e trattamento selezionato
  const [services, setServices] = useState<BarberService[]>(DEFAULT_SERVICES);
  const [selectedServiceId, setSelectedServiceId] = useState<string>("srv_taglio");

  useEffect(() => {
    if (!isOpen) return;

    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("smart_barber_services");
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setServices(parsed.filter((s: BarberService) => s.enabled));
          }
        } catch {}
      }
    }

    getSalonPublicInfo().then((res) => {
      if (res.services && res.services.length > 0) {
        const active = res.services.filter((s) => s.enabled);
        setServices(active);
        if (initialServiceName) {
          const matched = active.find((s) => s.name.toLowerCase().includes(initialServiceName.toLowerCase()));
          if (matched) setSelectedServiceId(matched.id);
        }
      }
    });
  }, [isOpen, initialServiceName]);

  const currentService = services.find((s) => s.id === selectedServiceId) || services[0] || {
    id: "srv_taglio",
    name: "Taglio Capelli Luxury",
    price_cents: 2500,
    duration_minutes: 30,
    enabled: true,
  };

  useEffect(() => {
    if (isOpen && typeof window !== "undefined") {
      const savedPhone = localStorage.getItem("smart_barber_customer_phone");
      const savedName = localStorage.getItem("smart_barber_customer_name");
      if (savedPhone && !phone) setPhone(savedPhone);
      if (savedName && !name) setName(savedName);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isSuccess && autoCloseDelayMs) {
      const timer = setTimeout(() => {
        onClose();
      }, autoCloseDelayMs);
      return () => clearTimeout(timer);
    }
  }, [isSuccess, autoCloseDelayMs, onClose]);

  if (!isOpen) return null;

  const formattedDate = format(new Date(`${date}T00:00:00`), "EEEE d MMMM yyyy", {
    locale: it,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim()) {
      setErrorMessage("Inserisci il tuo nome per completare la prenotazione.");
      return;
    }

    if (!phone.trim() || phone.trim().length < 6) {
      setErrorMessage("Inserisci un numero di telefono valido per confermare l'appuntamento.");
      return;
    }

    setIsSubmitting(true);

    try {
      let lookbookImageUrl: string | undefined = undefined;

      // Upload lookbook image se presente
      if (imageFile) {
        setUploadingImage(true);
        try {
          const processedFile = await compressImageForUpload(imageFile);
          const formData = new FormData();
          formData.append("file", processedFile);

          const uploadRes = await uploadLookbookImage(formData);
          if (uploadRes.success && uploadRes.publicUrl) {
            lookbookImageUrl = uploadRes.publicUrl;
          } else if (uploadRes.error) {
            console.warn("Upload foto non riuscito:", uploadRes.error);
          }
        } catch (uploadErr) {
          console.warn("Errore caricamento foto:", uploadErr);
        } finally {
          setUploadingImage(false);
        }
      }

      // Esecuzione prenotazione deterministica con trattamento e prezzo specifico
      const res = await bookAppointment({
        date,
        time,
        customerName: name.trim(),
        customerPhone: phone.trim(),
        paymentMethod,
        serviceName: currentService.name,
        priceCents: currentService.price_cents,
        notes: notes.trim() || undefined,
        lookbookImageUrl,
      });

      if (!res.success) {
        setErrorMessage(res.error || "Errore durante la prenotazione.");
        setIsSubmitting(false);
        return;
      }

      setIsSuccess(true);
      if (typeof window !== "undefined") {
        localStorage.setItem("smart_barber_customer_phone", phone.trim());
        localStorage.setItem("smart_barber_customer_name", name.trim());
      }
      if (res.appointmentId && onBookingSuccess) {
        onBookingSuccess(res.appointmentId);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Si è verificato un errore inaspettato.";
      setErrorMessage(msg);
      setIsSubmitting(false);
    }
  };

  const formattedServicePrice = (currentService.price_cents / 100).toFixed(2).replace(".00", "") + " €";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md glass-panel-gold rounded-3xl p-5 sm:p-7 space-y-5 shadow-2xl border border-amber-500/30 max-h-[90vh] overflow-y-auto">
        {/* Pulsante Chiusura */}
        <button
          onClick={onClose}
          type="button"
          className="absolute top-5 right-5 text-zinc-400 hover:text-zinc-100 p-1.5 rounded-full hover:bg-white/5 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {isSuccess ? (
          <div className="py-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto animate-in zoom-in duration-300">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-bold text-zinc-100">Prenotazione Confermata!</h3>
              <p className="text-sm text-zinc-300 capitalize">{formattedDate}</p>
              <p className="text-lg font-semibold text-amber-400">Ore {time}</p>
            </div>
            <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 space-y-1">
              <div>Cliente: <strong className="text-zinc-100">{name}</strong> ({phone})</div>
              <div>Trattamento: <strong className="text-amber-400">{currentService.name}</strong> ({formattedServicePrice})</div>
              <div>Modalità: <strong className="text-amber-400">{paymentMethod === "in_app" ? "Pagato in App" : "Pagamento in Salone"}</strong></div>
            </div>

            {/* Pulsante Promemoria WhatsApp Gratuito */}
            <a
              href={buildAppointmentWhatsAppUrl({
                customerName: name,
                serviceName: currentService.name,
                dateStr: formattedDate,
                timeStr: time,
                priceFormatted: formattedServicePrice,
              })}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 px-4 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Salva Promemoria su WhatsApp</span>
            </a>

            {autoCloseDelayMs && (
              <p className="text-[11px] text-zinc-400 animate-pulse">
                Reindirizzamento automatico alla Home...
              </p>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 px-4 rounded-xl font-semibold bg-amber-500 hover:bg-amber-400 text-black transition shadow-lg shadow-amber-500/20"
            >
              {closeButtonLabel || "Fatto"}
            </button>
          </div>
        ) : (
          <>
            {/* Header del Modale */}
            <div className="space-y-1">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-amber-400">
                Conferma Appuntamento
              </span>
              <h3 className="text-xl font-bold text-zinc-100 capitalize">{formattedDate}</h3>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold">
                <span>Orario:</span>
                <span className="text-amber-400 font-bold">{time}</span>
                <span className="text-zinc-400 font-normal">(~{currentService.duration_minutes} min)</span>
              </div>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
                {errorMessage}
              </div>
            )}

            {/* Form Name & Phone Obbligatori */}
            <form onSubmit={handleSubmit} className="space-y-3.5 text-left">
              {/* Selezione Trattamento e Prezzo */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                    <Scissors className="w-3.5 h-3.5 text-amber-400" />
                    Trattamento Selezionato
                  </label>
                  <span className="text-amber-400 font-black text-sm font-mono">
                    {formattedServicePrice}
                  </span>
                </div>
                <select
                  value={selectedServiceId}
                  onChange={(e) => setSelectedServiceId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700/80 focus:border-amber-500 focus:outline-none text-zinc-100 text-xs font-semibold transition"
                >
                  {services.map((srv) => (
                    <option key={srv.id} value={srv.id} className="bg-zinc-900 text-zinc-100">
                      {srv.name} — {(srv.price_cents / 100).toFixed(2).replace(".00", "")} € (~{srv.duration_minutes} min)
                    </option>
                  ))}
                </select>
                {currentService.description && (
                  <p className="text-[11px] text-zinc-400 italic px-1 pt-0.5">
                    {currentService.description}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-amber-400" />
                    Nome e Cognome di riferimento <span className="text-amber-500">*</span>
                  </label>
                  {(name || phone) && (
                    <button
                      type="button"
                      onClick={() => {
                        setName("");
                        setPhone("");
                        if (typeof window !== "undefined") {
                          localStorage.removeItem("smart_barber_customer_phone");
                          localStorage.removeItem("smart_barber_customer_name");
                        }
                      }}
                      className="text-[10px] text-zinc-500 hover:text-amber-400 underline transition"
                    >
                      Cambia dati cliente
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  required
                  placeholder="Es. Mario Rossi"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900/90 border border-zinc-700/80 focus:border-amber-500 focus:outline-none text-zinc-100 text-xs placeholder:text-zinc-500 transition"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-amber-400" />
                  Numero di Telefono (Obbligatorio per promemoria) <span className="text-amber-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  placeholder="Es. 347 1234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900/90 border border-zinc-700/80 focus:border-amber-500 focus:outline-none text-zinc-100 text-xs placeholder:text-zinc-500 transition"
                />
              </div>

              {/* Scelta Modalità di Pagamento */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">
                  Modalità di Pagamento
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("in_person")}
                    className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition ${
                      paymentMethod === "in_person"
                        ? "bg-amber-500/20 border-amber-500 text-amber-200"
                        : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <Banknote className="w-4 h-4 text-amber-400 shrink-0" />
                    <div>
                      <div className="text-xs font-bold leading-none">In Salone</div>
                      <div className="text-[10px] text-zinc-400 mt-0.5">Contanti / POS</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod("in_app")}
                    className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition ${
                      paymentMethod === "in_app"
                        ? "bg-amber-500/20 border-amber-500 text-amber-200"
                        : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <CreditCard className="w-4 h-4 text-amber-400 shrink-0" />
                    <div>
                      <div className="text-xs font-bold leading-none">Paga Online</div>
                      <div className="text-[10px] text-zinc-400 mt-0.5">Carta / Apple Pay</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Lookbook Foto di riferimento */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
                  Foto di riferimento taglio desiderato (opzionale)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-zinc-400 file:mr-2 file:py-1.5 file:px-2.5 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-amber-500/10 file:text-amber-400 hover:file:bg-amber-500/20 file:cursor-pointer transition"
                />
              </div>

              {/* Note speciali */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                  Note speciali per il barbiere
                </label>
                <input
                  type="text"
                  placeholder="Es. Sfumatura a zero, cura barba"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900/90 border border-zinc-700/80 focus:border-amber-500 focus:outline-none text-zinc-100 text-xs placeholder:text-zinc-500 transition"
                />
              </div>

              {/* Informativa Privacy GDPR */}
              <div className="text-[11px] text-zinc-400 text-center leading-relaxed">
                <span>I tuoi dati sono protetti in conformità al GDPR. Consulta l&apos;</span>
                <button
                  type="button"
                  onClick={() => setIsPrivacyOpen(true)}
                  className="text-amber-400 hover:text-amber-300 underline font-semibold transition inline ml-0.5"
                >
                  Informativa Privacy
                </button>
                <span>.</span>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting || uploadingImage}
                  className="w-full py-3.5 px-4 rounded-xl font-bold bg-amber-500 hover:bg-amber-400 text-black transition shadow-lg shadow-amber-500/25 flex flex-wrap items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed text-xs uppercase tracking-wider"
                >
                  {isSubmitting || uploadingImage ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Elaborazione...</span>
                    </>
                  ) : (
                    <>
                      <span>Conferma Prenotazione</span>
                      <span className="text-[11px] opacity-90 normal-case font-semibold">
                        • {paymentMethod === "in_app" ? "Online" : "In Salone"} ({formattedServicePrice})
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </>
        )}
      </div>

      {/* Modal Privacy Policy GDPR */}
      <PrivacyPolicyModal
        isOpen={isPrivacyOpen}
        onClose={() => setIsPrivacyOpen(false)}
      />
    </div>
  );
}
