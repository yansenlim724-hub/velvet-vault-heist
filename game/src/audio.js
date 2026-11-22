// Sound only: tiny WebAudio synth notes, no audio files. The context is
// created lazily on the first call (a user gesture), so the game never
// complains in a tab that has not been touched yet.
let context = null;

function ac() {
  if (context === null) {
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      context = new Ctor();
    } catch {
      context = false;
    }
  }
  return context || null;
}

function tone(freq, seconds, type, gainValue, when = 0) {
  const ctx = ac();
  if (!ctx) return;
  const start = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + seconds + 0.05);
}

export function createAudio() {
  return {
    /** A soft coin chime when side loot is taken. */
    pickup() {
      tone(880, 0.12, 'sine', 0.12);
      tone(1318, 0.18, 'sine', 0.1, 0.07);
    },
    /** A bright fanfare for the main target. */
    mainLoot() {
      tone(523, 0.14, 'triangle', 0.14);
      tone(659, 0.14, 'triangle', 0.14, 0.09);
      tone(784, 0.22, 'triangle', 0.14, 0.18);
      tone(1046, 0.3, 'triangle', 0.12, 0.27);
    },
    /** The lock clicks open. */
    unlock() {
      tone(320, 0.08, 'square', 0.07);
      tone(520, 0.12, 'square', 0.07, 0.08);
    },
    /** A short rising blip while the alarm climbs. */
    spotted() {
      tone(220, 0.16, 'sawtooth', 0.09);
      tone(330, 0.2, 'sawtooth', 0.09, 0.1);
    },
    /** The caught sting. */
    caught() {
      tone(196, 0.35, 'sawtooth', 0.14);
      tone(147, 0.5, 'sawtooth', 0.14, 0.18);
    },
    /** A soft puff for the smoke pellet. */
    smoke() {
      tone(180, 0.3, 'sine', 0.08);
    },
    /** A zap for the EMP. */
    emp() {
      tone(1200, 0.08, 'square', 0.06);
      tone(300, 0.2, 'square', 0.06, 0.06);
    },
    /** The getaway jingle. */
    getaway() {
      const notes = [523, 659, 784, 1046, 784, 1046];
      notes.forEach((freq, index) => tone(freq, 0.2, 'triangle', 0.12, index * 0.11));
    },
    /** A low thud when a level starts. */
    start() {
      tone(130, 0.25, 'sine', 0.1);
    },
  };
}
