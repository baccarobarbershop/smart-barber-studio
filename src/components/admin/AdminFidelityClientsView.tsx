"use client";

import { useState, useEffect } from "react";
import {
  Award,
  Search,
  Plus,
  Minus,
  Gift,
  Phone,
  MessageCircle,
  CheckCircle2,
  Loader2,
  Sparkles,
  Ban,
  Unlock,
  Lock,
  Edit2,
  Check,
  X,
  FileText,
} from "lucide-react";
import {
  fetchClientsFidelityList,
  adjustClientFidelityPoints,
  redeemClientReward,
  resetCustomerNoShows,
  updateClientInternalNotes,
} from "@/app/actions/admin";
import type { BusinessSettings } from "@/types/database";

interface AdminFidelityClientsViewProps {
  settings: BusinessSettings;
}

interface ClientProfileItem {
  id: string;
  full_name: string;
  phone: string;
  fidelity_points: number;
  no_show_count?: number;
  is_no_show_blocked?: boolean;
  internal_notes?: string | null;
}

export function AdminFidelityClientsView({ settings }: AdminFidelityClientsViewProps) {
  const [clients, setClients] = useState<ClientProfileItem[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Note Riservate Barbiere (Editing inline)
  const [editingNotePhone, setEditingNotePhone] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);

  const handleStartEditNote = (phone: string, currentNote?: string | null) => {
    setEditingNotePhone(phone);
    setNoteInput(currentNote || "");
  };

  const handleCancelEditNote = () => {
    setEditingNotePhone(null);
    setNoteInput("");
  };

  const handleSaveNote = async (phone: string) => {
    setIsSavingNote(true);
    try {
      const res = await updateClientInternalNotes(phone, noteInput);
      if (res.success) {
        setClients((prev) =>
          prev.map((c) => (c.phone === phone ? { ...c, internal_notes: res.notes } : c))
        );
        setEditingNotePhone(null);
        setFeedbackMessage("Note riservate cliente aggiornate con successo!");
        setTimeout(() => setFeedbackMessage(null), 2500);
      }
    } catch (e) {
      console.error("Errore salvataggio note interne:", e);
    } finally {
      setIsSavingNote(false);
    }
  };

  const targetPoints = settings.fidelity_target_points || 10;

  const loadClients = async () => {
    setIsLoading(true);
    try {
      const data = await fetchClientsFidelityList();
      setClients(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadClients();
  }, []);

  const handleAdjust = async (clientId: string, delta: number) => {
    setActionLoadingId(clientId);
    try {
      const res = await adjustClientFidelityPoints(clientId, delta);
      if (res.success && res.newPoints !== undefined) {
        setClients((prev) =>
          prev.map((c) => (c.id === clientId ? { ...c, fidelity_points: res.newPoints! } : c))
        );
        setFeedbackMessage(
          delta > 0 ? "Punto accreditato con successo!" : "Punto rimosso con successo!"
        );
        setTimeout(() => setFeedbackMessage(null), 2500);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRedeem = async (clientId: string, clientName: string) => {
    if (
      !confirm(
        `Confermi l'erogazione del premio "${settings.fidelity_reward_description}" per ${clientName}? Verranno scalati ${targetPoints} punti dalla sua tessera.`
      )
    )
      return;

    setActionLoadingId(clientId);
    try {
      const res = await redeemClientReward(clientId);
      if (res.success && res.newPoints !== undefined) {
        setClients((prev) =>
          prev.map((c) => (c.id === clientId ? { ...c, fidelity_points: res.newPoints! } : c))
        );
        setFeedbackMessage(`Premio erogato con successo a ${clientName}!`);
        setTimeout(() => setFeedbackMessage(null), 3000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleResetNoShows = async (phone: string, clientName: string) => {
    if (!confirm(`Vuoi sanare i No-Show di ${clientName} e riabilitare le sue prenotazioni online?`)) {
      return;
    }
    setActionLoadingId(`noshow-${phone}`);
    try {
      const res = await resetCustomerNoShows(phone);
      if (res.success) {
        setClients((prev) =>
          prev.map((c) =>
            c.phone === phone ? { ...c, no_show_count: 0, is_no_show_blocked: false } : c
          )
        );
        setFeedbackMessage(`No-Show sanati per ${clientName}. Il cliente può nuovamente prenotare online.`);
        setTimeout(() => setFeedbackMessage(null), 3500);
      }
    } catch (e) {
      console.error("Errore reset no-shows:", e);
    } finally {
      setActionLoadingId(null);
    }
  };

  const filteredClients = clients.filter((c) => {
    const q = search.toLowerCase();
    return (
      (c.full_name || "").toLowerCase().includes(q) ||
      (c.phone || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Bar Feedback */}
      {feedbackMessage && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{feedbackMessage}</span>
        </div>
      )}

      {/* Header & Ricerca */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-400" />
            <span>Gestione Carte Fedeltà Clienti</span>
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Soglia premio attuale: <strong className="text-amber-400">{targetPoints} punti</strong> ({settings.fidelity_reward_description}).
          </p>
        </div>

        {/* Input Ricerca */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cerca cliente o telefono..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs outline-none focus:border-amber-500 transition"
          />
        </div>
      </div>

      {/* Tabella / Cards Clienti */}
      {isLoading ? (
        <div className="py-12 flex flex-col items-center justify-center space-y-2">
          <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
          <span className="text-xs text-zinc-400">Caricamento clienti e tessere...</span>
        </div>
      ) : filteredClients.length === 0 ? (
        <div className="py-12 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-3xl">
          Nessun cliente trovato.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredClients.map((client) => {
            const points = client.fidelity_points || 0;
            const hasUnlocked = points >= targetPoints;
            const cleanPhone = (client.phone || "").replace(/\D/g, "");

            return (
              <div
                key={client.id}
                className={`p-4 rounded-2xl border transition space-y-3 ${
                  hasUnlocked
                    ? "bg-amber-500/10 border-amber-500/40 shadow-lg shadow-amber-500/5"
                    : "bg-zinc-900/90 border-zinc-800"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-zinc-100 flex items-center gap-1.5">
                      {client.full_name}
                      {hasUnlocked && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500 text-black font-black uppercase tracking-wider">
                          Premio Sbloccato!
                        </span>
                      )}
                    </h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-zinc-400 font-mono">{client.phone}</span>
                      {cleanPhone && (
                        <a
                          href={`https://wa.me/${cleanPhone.startsWith("39") ? cleanPhone : "39" + cleanPhone}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1 rounded-md text-emerald-400 hover:bg-emerald-500/10 transition"
                          title="Invia messaggio WhatsApp"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>

                    {/* Stato No-Show & Sblocco Rapido Barbiere */}
                    {client.is_no_show_blocked ? (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 font-bold border border-red-500/40 flex items-center gap-1">
                          <Ban className="w-3 h-3 text-red-400" />
                          <span>3 No-Show (Prenotazioni Online Bloccate)</span>
                        </span>
                        <button
                          type="button"
                          disabled={actionLoadingId === `noshow-${client.phone}`}
                          onClick={() => handleResetNoShows(client.phone, client.full_name)}
                          className="px-2 py-0.5 rounded-lg bg-zinc-800 hover:bg-emerald-500 hover:text-black border border-zinc-700 text-zinc-300 text-[10px] font-bold flex items-center gap-1 transition shadow-sm"
                          title="Azzera i No-Show e riabilita le prenotazioni online per questo cliente"
                        >
                          <Unlock className="w-3 h-3 text-emerald-400" />
                          <span>Sblocca</span>
                        </button>
                      </div>
                    ) : (client.no_show_count || 0) > 0 ? (
                      <div className="pt-1.5">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-semibold border border-amber-500/30 inline-flex items-center gap-1">
                          <span>⚠️ {client.no_show_count} / 3 No-Show</span>
                        </span>
                      </div>
                    ) : null}
                  </div>

                  <div className="text-right">
                    <span className="text-xl font-black text-amber-400">
                      {points} <span className="text-xs text-zinc-500 font-normal">/ {targetPoints}</span>
                    </span>
                    <span className="text-[10px] text-zinc-400 block">Punti Fedeltà</span>
                  </div>
                </div>

                {/* Barra di avanzamento */}
                <div className="w-full bg-zinc-950 rounded-full h-2 overflow-hidden border border-zinc-800">
                  <div
                    className={`h-full transition-all duration-300 ${
                      hasUnlocked ? "bg-amber-400" : "bg-amber-500/80"
                    }`}
                    style={{ width: `${Math.min(100, (points / targetPoints) * 100)}%` }}
                  />
                </div>

                {/* Note Riservate Barbiere (Invisibili al cliente) */}
                <div className="pt-2 border-t border-zinc-800/60">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-400 mb-1">
                    <span className="flex items-center gap-1 text-amber-400">
                      <Lock className="w-3 h-3" />
                      <span>Note Riservate Barbiere</span>
                    </span>
                    {editingNotePhone !== client.phone && (
                      <button
                        type="button"
                        onClick={() => handleStartEditNote(client.phone, client.internal_notes)}
                        className="text-[10px] text-zinc-400 hover:text-amber-300 flex items-center gap-1 transition"
                      >
                        <Edit2 className="w-2.5 h-2.5" />
                        <span>{client.internal_notes ? "Modifica" : "+ Aggiungi nota"}</span>
                      </button>
                    )}
                  </div>

                  {editingNotePhone === client.phone ? (
                    <div className="space-y-2 mt-1 animate-in fade-in">
                      <textarea
                        value={noteInput}
                        onChange={(e) => setNoteInput(e.target.value)}
                        placeholder="Es. Sfumatura a 0.5 con macchinetta, panno non bollente, preferisce caffè macchiato..."
                        rows={2}
                        className="w-full p-2.5 rounded-xl bg-zinc-950 border border-amber-500/50 text-zinc-100 text-xs outline-none focus:ring-1 focus:ring-amber-500 transition resize-none placeholder:text-zinc-600"
                        autoFocus
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={handleCancelEditNote}
                          className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-medium transition"
                        >
                          Annulla
                        </button>
                        <button
                          type="button"
                          disabled={isSavingNote}
                          onClick={() => handleSaveNote(client.phone)}
                          className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-[11px] font-bold flex items-center gap-1 transition shadow-sm"
                        >
                          {isSavingNote ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Check className="w-3 h-3" />
                          )}
                          <span>Salva Nota</span>
                        </button>
                      </div>
                    </div>
                  ) : client.internal_notes ? (
                    <p className="text-xs text-zinc-300 bg-zinc-950/70 p-2.5 rounded-xl border border-zinc-800/80 leading-relaxed italic">
                      &quot;{client.internal_notes}&quot;
                    </p>
                  ) : (
                    <p className="text-[11px] text-zinc-600 italic">
                      Nessuna nota tecnica o preferenza registrata per questo cliente.
                    </p>
                  )}
                </div>

                {/* Azioni del Barbiere: Assegna / Rimuovi / Riscatta */}
                <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={actionLoadingId === client.id}
                      onClick={() => handleAdjust(client.id, 1)}
                      title="Aggiungi 1 punto manualmente"
                      className="px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center gap-1 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+1 Punto</span>
                    </button>
                    <button
                      type="button"
                      disabled={actionLoadingId === client.id || points === 0}
                      onClick={() => handleAdjust(client.id, -1)}
                      title="Rimuovi 1 punto"
                      className="p-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition disabled:opacity-30"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {hasUnlocked && (
                    <button
                      type="button"
                      disabled={actionLoadingId === client.id}
                      onClick={() => handleRedeem(client.id, client.full_name)}
                      className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black flex items-center gap-1.5 transition shadow-md shadow-amber-500/25"
                    >
                      <Gift className="w-3.5 h-3.5" />
                      <span>Riscatta Premio</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

