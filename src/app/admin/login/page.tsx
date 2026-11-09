"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Scissors, Lock, ArrowRight, Delete, AlertCircle, ArrowLeft } from "lucide-react";
import { loginAdmin } from "@/app/actions/auth";
import Link from "next/link";

export default function AdminLoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleKeyPress = (num: string) => {
    if (pin.length < 8) {
      setPin((prev) => prev + num);
      setErrorMessage(null);
    }
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
    setErrorMessage(null);
  };

  const handleClear = () => {
    setPin("");
    setErrorMessage(null);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pin) {
      setErrorMessage("Inserisci il PIN del salone.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await loginAdmin(pin);
      if (!res.success) {
        setErrorMessage(res.error || "PIN errato.");
        setPin("");
      } else {
        router.push("/admin");
        router.refresh();
      }
    } catch (err) {
      setErrorMessage("Errore durante l'autenticazione.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-zinc-950 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-sm w-full bg-zinc-950 border border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-6 relative z-10 shadow-2xl">
        <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
          <Link
            href="/"
            className="p-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100 transition inline-flex items-center gap-1 text-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Home</span>
          </Link>
          <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider flex items-center gap-1">
            <Lock className="w-3 h-3" />
            Staff Only
          </span>
        </div>

        <div className="text-center space-y-1.5">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto shadow-inner">
            <Scissors className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-black text-zinc-100">Area Riservata Barbiere</h2>
          <p className="text-xs text-zinc-400">
            Inserisci il codice di sicurezza del salone per accedere all&apos;agenda e alla gestione.
          </p>
        </div>

        {errorMessage && (
          <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Display PIN con pallini oscurati */}
        <div className="flex justify-center items-center gap-3 py-2">
          {Array.from({ length: 4 }).map((_, idx) => {
            const isFilled = idx < pin.length;
            return (
              <div
                key={idx}
                className={`w-4 h-4 rounded-full transition-all duration-150 border ${
                  isFilled
                    ? "bg-amber-400 border-amber-300 scale-110 shadow-md shadow-amber-400/50"
                    : "bg-zinc-900 border-zinc-700"
                }`}
              />
            );
          })}
        </div>

        {/* Tastierino Numerico Touch-Friendly per smartphone */}
        <div className="grid grid-cols-3 gap-2.5 pt-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => handleKeyPress(num)}
              className="py-3.5 rounded-2xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 text-lg font-bold text-zinc-100 active:scale-95 transition"
            >
              {num}
            </button>
          ))}
          <button
            type="button"
            onClick={handleClear}
            className="py-3.5 rounded-2xl bg-zinc-900/50 hover:bg-zinc-800/80 border border-zinc-800 text-xs font-semibold text-zinc-400 active:scale-95 transition"
          >
            Canc
          </button>
          <button
            type="button"
            onClick={() => handleKeyPress("0")}
            className="py-3.5 rounded-2xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 text-lg font-bold text-zinc-100 active:scale-95 transition"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="py-3.5 rounded-2xl bg-zinc-900/50 hover:bg-zinc-800/80 border border-zinc-800 text-zinc-400 hover:text-zinc-200 flex items-center justify-center active:scale-95 transition"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        {/* Pulsante Conferma */}
        <button
          type="button"
          disabled={isLoading || pin.length < 4}
          onClick={() => handleSubmit()}
          className="w-full py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black uppercase tracking-wider transition shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 disabled:opacity-40"
        >
          <span>Accedi al Pannello</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </main>
  );
}

