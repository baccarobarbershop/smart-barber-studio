/**
 * Sintetizzatore Web Audio API per notifiche acustiche raffinate ed eleganti in salone.
 * Non richiede file audio esterni, funziona istantaneamente su qualsiasi browser, tablet o smartphone.
 */

export function playLuxuryBookingChime(): void {
  if (typeof window === "undefined") return;

  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    // Doppio tocco arpeggiato a campana (C6 -> E6: 1046.5Hz -> 1318.5Hz)
    const playBellHarmonic = (freq: number, startTime: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, startTime);

      // Attacco morbido (20ms) e decadimento esponenziale naturale da campana dorata
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.linearRampToValueAtTime(0.2, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const now = ctx.currentTime;
    playBellHarmonic(1046.5, now, 0.9); // C6 - prima nota
    playBellHarmonic(1318.5, now + 0.14, 1.3); // E6 - seconda nota armonica
  } catch (e) {
    console.warn("Riproduzione tocco sonoro non disponibile:", e);
  }
}

