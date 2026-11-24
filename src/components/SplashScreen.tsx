import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import {
  getAudioState,
  isAudioMuted,
  playEnterChime,
  playPixarHop,
  playSpotlightOn,
  playSquashBounce,
  playStatyRevealChord,
  playTransitionOpen,
  setAudioMuted,
  unlockAudio,
} from '../lib/soundEffects.ts';
import type { StatyExpression, StatyGesture } from '../types/index.ts';
import { StatyMascot } from './StatyMascot.tsx';

interface SplashScreenProps {
  onComplete: () => void;
}

type StagePhase = 'lights' | 'hop1' | 'hop2' | 'hop3' | 'squash' | 'look' | 'exit';

const LETTERS = ['S', 'T', 'A', 'T', 'L', 'Y', 'T', 'I', 'C', 'S'];

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  const [phase, setPhase] = useState<StagePhase>('lights');
  const [expression, setExpression] = useState<StatyExpression>('idle');
  const [gesture, setGesture] = useState<StatyGesture>('none');
  const [muted, setMuted] = useState<boolean>(() => isAudioMuted());
  const [audioActive, setAudioActive] = useState<boolean>(false);
  const [runKey, setRunKey] = useState<number>(0);

  const timersRef = useRef<number[]>([]);

  const clearTimers = () => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  };

  const handleUnlockSound = useCallback(async (withChime = true) => {
    const ok = await unlockAudio();
    setAudioActive(ok);
    if (ok && withChime && !isAudioMuted()) {
      playEnterChime();
    }
  }, []);

  const toggleMute = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !muted;
    setAudioMuted(next);
    setMuted(next);
    if (!next) {
      await handleUnlockSound(true);
    }
  };

  const handleReplay = async (e: React.MouseEvent) => {
    e.stopPropagation();
    clearTimers();
    await handleUnlockSound(false);
    setPhase('lights');
    setExpression('idle');
    setGesture('none');
    setRunKey((k) => k + 1);
  };

  const handleSkip = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    clearTimers();
    await handleUnlockSound(false);
    if (!isAudioMuted()) {
      playEnterChime();
    }
    setPhase('exit');
    window.setTimeout(onComplete, 320);
  };

  useEffect(() => {
    clearTimers();

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setPhase('look');
      setExpression('greeting');
      setGesture('wave-wink');
      const done = window.setTimeout(onComplete, 1300);
      timersRef.current.push(done);
      return clearTimers;
    }

    // Attempt unlocking Web Audio automatically (works seamlessly when browser permits autoplay)
    unlockAudio().then((ok) => {
      setAudioActive(ok);
      if (ok && !isAudioMuted()) {
        playSpotlightOn();
      }
    });

    const schedule = (fn: () => void, ms: number) => {
      const id = window.setTimeout(fn, ms);
      timersRef.current.push(id);
    };

    schedule(() => {
      setPhase('hop1');
      setExpression('excited');
      setGesture('ear-perk');
      playPixarHop(1);
    }, 380);

    schedule(() => {
      setPhase('hop2');
      setExpression('happy');
      playPixarHop(2);
    }, 840);

    schedule(() => {
      setPhase('hop3');
      setExpression('excited');
      playPixarHop(3);
    }, 1300);

    schedule(() => {
      setPhase('squash');
      setExpression('blinking');
      playSquashBounce();
    }, 1680);

    schedule(() => {
      setPhase('look');
      setExpression('greeting');
      setGesture('wave-wink');
      playStatyRevealChord();
    }, 2120);

    schedule(() => {
      setPhase('exit');
      if (!isAudioMuted()) {
        playTransitionOpen();
      }
    }, 4100);

    schedule(() => {
      onComplete();
    }, 4580);

    return clearTimers;
  }, [onComplete, runKey]);

  const isSquashed = phase === 'squash' || phase === 'look' || phase === 'exit';
  const showBrandDetails = phase === 'look' || phase === 'exit';

  // Coordinated Pixar-style keyframes relative to the "I" slot
  const statyVariants = {
    lights: {
      x: -165,
      y: -6,
      scaleX: 0.9,
      scaleY: 0.9,
      rotate: -8,
      opacity: 0,
    },
    hop1: {
      x: -135,
      y: [0, -56, 0],
      scaleX: [1, 0.88, 1.18, 1],
      scaleY: [1, 1.16, 0.8, 1],
      rotate: [-8, 8, -3, 0],
      opacity: 1,
      transition: { duration: 0.44, times: [0, 0.48, 0.86, 1], ease: 'easeInOut' as const },
    },
    hop2: {
      x: -68,
      y: [0, -72, 0],
      scaleX: [1, 0.86, 1.2, 1],
      scaleY: [1, 1.18, 0.78, 1],
      rotate: [-4, 10, -4, 0],
      opacity: 1,
      transition: { duration: 0.44, times: [0, 0.48, 0.86, 1], ease: 'easeInOut' as const },
    },
    hop3: {
      x: 0,
      y: [0, -96, -12],
      scaleX: [1, 0.86, 1.08],
      scaleY: [1, 1.18, 0.92],
      rotate: [-4, 6, 0],
      opacity: 1,
      transition: { duration: 0.38, times: [0, 0.55, 1], ease: 'easeOut' as const },
    },
    squash: {
      x: 0,
      y: [18, 6, 10],
      scaleX: [1.26, 0.94, 1],
      scaleY: [0.72, 1.08, 1],
      rotate: 0,
      opacity: 1,
      transition: { duration: 0.42, times: [0, 0.6, 1], ease: 'easeOut' as const },
    },
    look: {
      x: 0,
      y: 10,
      scaleX: 1,
      scaleY: 1,
      rotate: 0,
      opacity: 1,
      transition: { type: 'spring' as const, stiffness: 260, damping: 18 },
    },
    exit: {
      x: 0,
      y: 6,
      scaleX: 0.96,
      scaleY: 0.96,
      opacity: 0,
      transition: { duration: 0.4 },
    },
  };

  return (
    <div
      key={runKey}
      onClick={() => {
        if (!audioActive && getAudioState() === 'suspended') {
          handleUnlockSound(true);
        }
      }}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-[#060E1F] text-white px-4 transition-opacity duration-500 select-none ${
        phase === 'exit' ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Theatrical Volumetric Spotlight Cone */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 transition-opacity duration-700 ${
          phase === 'lights' ? 'opacity-25' : 'opacity-100'
        }`}
        style={{
          background:
            'radial-gradient(ellipse 68% 54% at 50% 42%, rgba(56, 189, 248, 0.24) 0%, rgba(37, 99, 235, 0.14) 38%, rgba(6, 14, 31, 0.96) 76%)',
        }}
      />

      {/* Top Controls: Sound & Replay */}
      <div className="absolute top-4 right-4 left-4 z-20 flex items-center justify-between gap-2 max-w-4xl mx-auto">
        <button
          type="button"
          onClick={toggleMute}
          className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 backdrop-blur-md text-xs font-medium text-blue-100 inline-flex items-center gap-2 cursor-pointer transition-colors"
          aria-label={muted ? 'Unmute intro sounds' : 'Mute intro sounds'}
        >
          {muted ? (
            <>
              <VolumeX className="w-4 h-4 text-slate-300" />
              <span>Sound Muted</span>
            </>
          ) : audioActive ? (
            <>
              <Volume2 className="w-4 h-4 text-sky-300" />
              <span>Sound On</span>
            </>
          ) : (
            <>
              <Volume2 className="w-4 h-4 text-sky-300 animate-pulse" />
              <span>Tap anywhere for sound</span>
            </>
          )}
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReplay}
            className="min-h-[40px] px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 backdrop-blur-md text-xs font-medium text-blue-100 inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            title="Replay opening animation"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Replay</span>
          </button>
          <button
            type="button"
            onClick={handleSkip}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 backdrop-blur-md text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <span>Enter App</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Studio Stage */}
      <div className="relative z-10 flex flex-col items-center justify-center w-full max-w-2xl pt-16">
        {/* Horizon Stage Floor Glow */}
        <div
          aria-hidden="true"
          className="relative flex items-end justify-center w-full h-40 sm:h-48"
        >
          {/* Ground reflection line */}
          <div
            className={`absolute bottom-1 w-[88%] max-w-lg h-6 rounded-full blur-xl transition-all duration-700 ${
              showBrandDetails ? 'bg-sky-400/30 scale-105' : 'bg-blue-500/20 scale-95'
            }`}
          />

          {/* S T A T L Y T [I] C S Wordmark Baseline */}
          <div className="relative z-10 flex items-baseline justify-center gap-[0.14em] sm:gap-[0.2em] font-display text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-wide text-white drop-shadow-[0_6px_18px_rgba(37,99,235,0.45)]">
            {LETTERS.map((char, idx) => {
              if (char === 'I' && idx === 7) {
                return (
                  <span
                    key={`${char}-${idx}`}
                    className="relative inline-flex flex-col items-center justify-end"
                  >
                    {/* STATY Mascot anchored directly above the "I" slot so landing is pixel-exact across viewports */}
                    <motion.div
                      variants={statyVariants}
                      initial="lights"
                      animate={phase}
                      className="pointer-events-auto absolute bottom-[62%] left-1/2 -translate-x-1/2 z-20"
                    >
                      <StatyMascot
                        variant="full"
                        expression={expression}
                        gesture={gesture}
                        size="md"
                        interactive={false}
                      />
                    </motion.div>

                    {/* The iconic squishable "I" letter */}
                    <motion.span
                      animate={
                        isSquashed
                          ? {
                              scaleY: [1, 0.22, 0.34],
                              scaleX: [1, 1.48, 1.28],
                              color: '#38BDF8',
                            }
                          : { scaleY: 1, scaleX: 1, color: '#FFFFFF' }
                      }
                      transition={{ duration: 0.38, ease: 'easeOut' }}
                      style={{ transformOrigin: 'bottom center' }}
                      className="inline-block"
                    >
                      I
                    </motion.span>
                  </span>
                );
              }

              return (
                <motion.span
                  key={`${char}-${idx}`}
                  initial={{ opacity: 0.25, y: 6 }}
                  animate={{
                    opacity: phase === 'lights' ? 0.55 : 1,
                    y: 0,
                  }}
                  transition={{ duration: 0.45, delay: idx * 0.025 }}
                  className={idx >= 4 && idx <= 6 ? 'text-blue-200' : 'text-white'}
                >
                  {char}
                </motion.span>
              );
            })}
          </div>
        </div>

        {/* Tagline & Brand Subtitle */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={
            showBrandDetails
              ? { opacity: 1, y: 0 }
              : { opacity: 0, y: 14 }
          }
          transition={{ duration: 0.55, ease: 'easeOut' }}
          className="mt-5 text-center max-w-md"
        >
          <p className="text-xs sm:text-sm font-bold tracking-[0.26em] text-sky-300">
            ANALYZE. INTERPRET. INNOVATE.
          </p>
          <p className="mt-2.5 text-sm sm:text-base text-slate-300">
            Turn Your Data Into Meaningful Insights.
          </p>
        </motion.div>
      </div>
    </div>
  );
};
