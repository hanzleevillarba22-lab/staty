// Procedural Web Audio API sound synthesizer for Pixar-inspired tactile & UI transitions

let sharedAudioCtx: AudioContext | null = null;
let audioMuted = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new Ctx();
  }
  return sharedAudioCtx;
}

export function isAudioMuted(): boolean {
  return audioMuted;
}

export function setAudioMuted(muted: boolean): void {
  audioMuted = muted;
}

export function getAudioState(): 'running' | 'suspended' | 'unsupported' {
  const ctx = getAudioContext();
  if (!ctx) return 'unsupported';
  return ctx.state === 'running' ? 'running' : 'suspended';
}

export async function unlockAudio(): Promise<boolean> {
  const ctx = getAudioContext();
  if (!ctx) return false;
  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    return ctx.state === 'running';
  } catch {
    return false;
  }
}

function readyCtx(): AudioContext | null {
  if (audioMuted) return null;
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return null;
  return ctx;
}

function unlockAndPlay(player: () => void): void {
  if (audioMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'running') {
    player();
  } else {
    void unlockAudio().then((ok) => {
      if (ok && !audioMuted) player();
    });
  }
}

// 1. Spotlight click & warm theater hum
export function playSpotlightOn(): void {
  const ctx = readyCtx();
  if (!ctx) return;
  const now = ctx.currentTime;

  const clickOsc = ctx.createOscillator();
  const clickGain = ctx.createGain();
  clickOsc.type = 'triangle';
  clickOsc.frequency.setValueAtTime(420, now);
  clickOsc.frequency.exponentialRampToValueAtTime(95, now + 0.045);
  clickGain.gain.setValueAtTime(0.18, now);
  clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
  clickOsc.connect(clickGain).connect(ctx.destination);
  clickOsc.start(now);
  clickOsc.stop(now + 0.06);

  [130.81, 196.0, 293.66].forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + 0.03);
    gain.gain.setValueAtTime(0.0001, now + 0.03);
    gain.gain.linearRampToValueAtTime(0.045 / (idx + 1), now + 0.22);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.95);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + 0.03);
    osc.stop(now + 1.0);
  });
}

// 2. Elastic rubber-spring Pixar hop (step 1, 2, 3)
export function playPixarHop(step: 1 | 2 | 3): void {
  const ctx = readyCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const basePitch = step === 1 ? 155 : step === 2 ? 195 : 235;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(basePitch * 0.72, now);
  osc.frequency.exponentialRampToValueAtTime(basePitch * 1.95, now + 0.14);
  osc.frequency.exponentialRampToValueAtTime(basePitch * 1.15, now + 0.24);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(0.16, now + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.26);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.28);

  const tap = ctx.createOscillator();
  const tapGain = ctx.createGain();
  tap.type = 'triangle';
  tap.frequency.setValueAtTime(basePitch * 2.5, now);
  tap.frequency.exponentialRampToValueAtTime(basePitch * 1.5, now + 0.07);
  tapGain.gain.setValueAtTime(0.09, now);
  tapGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.09);
  tap.connect(tapGain).connect(ctx.destination);
  tap.start(now);
  tap.stop(now + 0.1);
}

// 3. Satisfying cushioned "I" squash thud + harmonic spring bounce
export function playSquashBounce(): void {
  const ctx = readyCtx();
  if (!ctx) return;
  const now = ctx.currentTime;

  const sub = ctx.createOscillator();
  const subGain = ctx.createGain();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(145, now);
  sub.frequency.exponentialRampToValueAtTime(52, now + 0.18);
  subGain.gain.setValueAtTime(0.28, now);
  subGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.22);
  sub.connect(subGain).connect(ctx.destination);
  sub.start(now);
  sub.stop(now + 0.24);

  const boing = ctx.createOscillator();
  const boingGain = ctx.createGain();
  boing.type = 'triangle';
  boing.frequency.setValueAtTime(220, now + 0.03);
  boing.frequency.exponentialRampToValueAtTime(460, now + 0.14);
  boing.frequency.exponentialRampToValueAtTime(340, now + 0.25);
  boing.frequency.exponentialRampToValueAtTime(410, now + 0.34);
  boingGain.gain.setValueAtTime(0.001, now + 0.03);
  boingGain.gain.linearRampToValueAtTime(0.14, now + 0.06);
  boingGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.42);
  boing.connect(boingGain).connect(ctx.destination);
  boing.start(now + 0.03);
  boing.stop(now + 0.45);
}

// 4. Expressive STATY chirp & luminous Cmaj9 reveal chord
export function playStatyRevealChord(): void {
  const ctx = readyCtx();
  if (!ctx) return;
  const now = ctx.currentTime;

  const chirpNotes = [523.25, 783.99, 1046.5];
  chirpNotes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t = now + i * 0.075;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.09, t + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.28);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.3);
  });

  const chord = [261.63, 329.63, 392.0, 493.88, 587.33];
  chord.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t = now + 0.16 + i * 0.045;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0008, t);
    gain.gain.linearRampToValueAtTime(0.055, t + 0.09);
    gain.gain.exponentialRampToValueAtTime(0.0006, t + 1.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 1.4);
  });
}

// 5. Crisp chime when unlocking audio or clicking Enter App
export function playEnterChime(): void {
  unlockAndPlay(() => {
    const ctx = readyCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    [587.33, 880.0].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + i * 0.07;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.08, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.34);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.36);
    });
  });
}

// 6. Satisfying stage-open / welcome transition swell (Intro -> Sign Up/In -> Main Dashboard)
export function playTransitionOpen(): void {
  unlockAndPlay(() => {
    const ctx = readyCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Gentle airy bubble sweep
    const pop = ctx.createOscillator();
    const popGain = ctx.createGain();
    pop.type = 'sine';
    pop.frequency.setValueAtTime(310, now);
    pop.frequency.exponentialRampToValueAtTime(620, now + 0.12);
    popGain.gain.setValueAtTime(0.001, now);
    popGain.gain.linearRampToValueAtTime(0.075, now + 0.025);
    popGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.22);
    pop.connect(popGain).connect(ctx.destination);
    pop.start(now);
    pop.stop(now + 0.24);

    // Warm ascending bell triad
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + 0.04 + i * 0.055;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.065, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0006, t + 0.36);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.38);
    });
  });
}

// 7. Cute light marimba-bubble swoosh when navigating between views / auth cards
export function playTransitionNavigate(): void {
  unlockAndPlay(() => {
    const ctx = readyCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(660, now + 0.09);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.06, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.16);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);

    const bell = ctx.createOscillator();
    const bellGain = ctx.createGain();
    bell.type = 'triangle';
    bell.frequency.setValueAtTime(784, now + 0.035);
    bellGain.gain.setValueAtTime(0.001, now + 0.035);
    bellGain.gain.linearRampToValueAtTime(0.035, now + 0.05);
    bellGain.gain.exponentialRampToValueAtTime(0.0006, now + 0.18);
    bell.connect(bellGain).connect(ctx.destination);
    bell.start(now + 0.035);
    bell.stop(now + 0.2);
  });
}

// 8. Soft rising pop for opening drawers / modals / mic confirm
export function playDrawerOpen(): void {
  unlockAndPlay(() => {
    const ctx = readyCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(580, now + 0.1);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.065, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.17);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.19);
  });
}

// 9. Soft descending pop for closing drawers / modals / dismissing
export function playDrawerClose(): void {
  unlockAndPlay(() => {
    const ctx = readyCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.055, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.16);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  });
}
