import React from 'react';
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from 'motion/react';
import type { ThemeMode } from '../types/index.ts';

interface CalmAmbientBackgroundProps {
  theme: ThemeMode;
  pointerX?: MotionValue<number>;
  pointerY?: MotionValue<number>;
  withParallax?: boolean;
}

export const CalmAmbientBackground: React.FC<CalmAmbientBackgroundProps> = ({
  theme,
  pointerX,
  pointerY,
  withParallax = true,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const { scrollY } = useScroll();

  const slowParallaxY = useTransform(scrollY, [0, 700], [0, withParallax && !prefersReducedMotion ? -54 : 0]);
  const midParallaxY = useTransform(scrollY, [0, 700], [0, withParallax && !prefersReducedMotion ? -92 : 0]);

  const fallbackZero = useTransform(scrollY, [0, 1], [0, 0]);
  const pxSlow = pointerX ?? fallbackZero;
  const pySlow = pointerY ?? fallbackZero;

  // Complementary palette from the opposite color mode, dialed to calming ultra-soft opacities:
  // Dark mode borrows soft sunlit-mist & cool sky hues from Light mode.
  // Light mode borrows serene midnight-navy & twilight slate hues from Dark mode.
  const isDark = theme === 'dark';

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 overflow-hidden z-0"
    >
      {/* Back slow-drifting complementary atmospheric veil */}
      <motion.div
        style={{
          y: slowParallaxY,
          x: pxSlow,
        }}
        className="absolute -inset-24"
      >
        <div
          className="calm-drift-a absolute -top-16 -left-16 w-[32rem] h-[32rem] rounded-full blur-3xl"
          style={{
            background: isDark
              ? 'radial-gradient(circle, rgba(224,242,254,0.085) 0%, rgba(147,197,253,0.035) 52%, transparent 74%)'
              : 'radial-gradient(circle, rgba(23,59,117,0.075) 0%, rgba(37,99,235,0.032) 52%, transparent 74%)',
          }}
        />
        <div
          className="calm-drift-b absolute top-1/3 -right-24 w-[36rem] h-[36rem] rounded-full blur-3xl"
          style={{
            background: isDark
              ? 'radial-gradient(circle, rgba(241,245,249,0.065) 0%, rgba(186,230,253,0.03) 50%, transparent 74%)'
              : 'radial-gradient(circle, rgba(15,23,42,0.065) 0%, rgba(30,58,138,0.028) 50%, transparent 74%)',
          }}
        />
      </motion.div>

      {/* Mid-layer serene horizon waves & gentle bell-curve contour */}
      <motion.div
        style={{
          y: midParallaxY,
          x: pySlow,
        }}
        className="absolute inset-0"
      >
        <svg
          viewBox="0 0 1440 700"
          preserveAspectRatio="none"
          className="calm-wave-c absolute bottom-[-8%] left-[-6%] w-[112%] h-[58%] opacity-70"
        >
          <path
            d="M0,460 C240,390 420,520 720,420 C1020,320 1200,480 1440,390 L1440,700 L0,700 Z"
            fill={isDark ? 'rgba(224, 242, 254, 0.032)' : 'rgba(23, 59, 117, 0.034)'}
          />
          <path
            d="M0,530 C320,470 520,590 860,485 C1120,405 1280,530 1440,480 L1440,700 L0,700 Z"
            fill={isDark ? 'rgba(186, 230, 253, 0.028)' : 'rgba(30, 64, 175, 0.028)'}
          />
          <path
            d="M80,410 Q420,405 560,260 T840,260 Q980,405 1360,410"
            fill="none"
            stroke={isDark ? 'rgba(224, 242, 254, 0.06)' : 'rgba(23, 59, 117, 0.055)'}
            strokeWidth="1.5"
            strokeDasharray="6 10"
          />
        </svg>
      </motion.div>
    </div>
  );
};
