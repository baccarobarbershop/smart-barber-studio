"use client";

import { X, ShieldCheck, Lock, UserCheck, Trash2, Phone, Sparkles } from "lucide-react";

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PrivacyPolicyModal({ isOpen, onClose }: PrivacyPolicyModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="relative max-w-lg w-full max-h-[85vh] bg-zinc-950 border border-amber-500/30 rounded-3xl p-6 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-100">
                Informativa sulla Privacy & GDPR
              </h3>
              <p className="text-xs text-zinc-400">
                Trattamento dei dati personali — Smart Barber Studio
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-zinc-900 text-zinc-400 hover:text-zinc-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4 text-xs text-zinc-300 pr-1">
          
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 space-y-1">
            <div className="font-bold text-xs flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              <span>I tuoi dati sono al sicuro</span>
            </div>
            <p className="text-[11px] text-amber-200/90 leading-relaxed">
              Trattiamo i tuoi dati esclusivamente per gestire i tuoi appuntamenti, inviarti i promemoria su WhatsApp e riconoscere i tuoi vantaggi fedeltà. Non cediamo né vendiamo mai i tuoi dati a terzi.
            </p>
          </div>

          <section className="space-y-1.5">
            <h4 className="font-bold text-zinc-100 text-xs flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              1. Titolare del Trattamento
            </h4>
            <p className="text-zinc-400 leading-relaxed">
              Il Titolare del trattamento è <strong>Smart Barber Studio</strong>, contattabile per qualsiasi chiarimento o richiesta relativa alla privacy tramite i recapiti telefonici e WhatsApp del salone indicati nell&apos;applicazione.
            </p>
          </section>

          <section className="space-y-1.5">
            <h4 className="font-bold text-zinc-100 text-xs flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              2. Dati Raccolti
            </h4>
            <p className="text-zinc-400 leading-relaxed">
              Raccogliamo esclusivamente le informazioni minime necessarie per erogare il servizio:
            </p>
            <ul className="list-disc list-inside space-y-1 text-zinc-400 pl-1">
              <li><strong>Nome e Cognome:</strong> per identificare la prenotazione al tuo arrivo in salone.</li>
              <li><strong>Numero di Cellulare:</strong> per verificare la tua identità, inviarti il promemoria dell&apos;appuntamento su WhatsApp e consentirti di disdire o spostare la prenotazione.</li>
              <li><strong>Fotografie di riferimento (facoltative):</strong> se decidi di allegare una foto di esempio per il taglio desiderato, l&apos;immagine viene utilizzata unicamente dal barbiere come guida visiva durante il servizio.</li>
            </ul>
          </section>

          <section className="space-y-1.5">
            <h4 className="font-bold text-zinc-100 text-xs flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              3. Finalità e Base Giuridica (Art. 6 GDPR)
            </h4>
            <p className="text-zinc-400 leading-relaxed">
              I dati sono trattati per:
            </p>
            <ul className="list-disc list-inside space-y-1 text-zinc-400 pl-1">
              <li>Esecuzione del servizio di prenotazione e accoglienza in salone (Art. 6.1.b GDPR).</li>
              <li>Invio di comunicazioni di servizio e promemoria gratuiti tramite WhatsApp (Art. 6.1.b GDPR).</li>
              <li>Gestione della raccolta punti e sconti fedeltà associati al tuo profilo (Art. 6.1.a/b GDPR).</li>
            </ul>
          </section>

          <section className="space-y-1.5">
            <h4 className="font-bold text-zinc-100 text-xs flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              4. Conservazione e Sicurezza
            </h4>
            <p className="text-zinc-400 leading-relaxed">
              Tutte le informazioni sono conservate su database protetti con crittografia. Non effettuiamo profilazione invasiva né diffusione pubblica dei tuoi dati personali. Le foto caricate possono essere rimosse o eliminate in qualsiasi momento.
            </p>
          </section>

          <section className="space-y-1.5">
            <h4 className="font-bold text-zinc-100 text-xs flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              5. I Tuoi Diritti (Art. 15-22 GDPR)
            </h4>
            <p className="text-zinc-400 leading-relaxed">
              In qualità di interessato, hai il diritto in ogni momento di:
            </p>
            <ul className="list-disc list-inside space-y-1 text-zinc-400 pl-1">
              <li>Richiedere l&apos;accesso ai tuoi dati personali e la verifica della loro esattezza.</li>
              <li>Chiedere la rettifica, l&apos;aggiornamento o la cancellazione definitiva del tuo profilo e dei tuoi appuntamenti (Diritto all&apos;Oblio).</li>
              <li>Revocare il consenso o richiedere l&apos;interruzione dei messaggi di promemoria.</li>
            </ul>
            <p className="text-zinc-400 pt-1">
              Per esercitare i tuoi diritti puoi rivolgerti direttamente al personale in salone o inviare un messaggio WhatsApp al numero ufficiale.
            </p>
          </section>

        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-zinc-800 shrink-0 flex items-center justify-between gap-3">
          <span className="text-[11px] text-zinc-500">
            Conforme Regolamento UE 2016/679 (GDPR)
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs uppercase tracking-wider transition shadow-lg shadow-amber-500/20"
          >
            Ho Capito
          </button>
        </div>

      </div>
    </div>
  );
}

