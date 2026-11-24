import React, { useId, useState } from 'react';
import type { StatyExpression, StatyGesture } from '../types/index.ts';

interface StatyMascotProps {
  expression?: StatyExpression;
  gesture?: StatyGesture;
  variant?: 'full' | 'head';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  interactive?: boolean;
  onMascotClick?: () => void;
  onTipChange?: (tip: string) => void;
  className?: string;
}

const RESEARCH_TIPS = [
  'Check normality (Shapiro-Wilk) and equal variance (Levene) before choosing a parametric test.',
  'Always distinguish statistical significance (p-value) from practical importance (effect size).',
  'Correlation measures linear association, never causation—always inspect scatterplots first.',
  'Clean missing values and verify measurement levels (Nominal, Ordinal, Interval, Ratio) before analysis.',
  'Use Welch’s t-test when group variances are unequal instead of forcing standard Student’s t.',
];

export const StatyMascot: React.FC<StatyMascotProps> = ({
  expression = 'idle',
  gesture = 'none',
  variant = 'full',
  size = 'md',
  interactive = true,
  onMascotClick,
  onTipChange,
  className = '',
}) => {
  const rawUid = useId().replace(/:/g, '');
  const blueId = `statyBlue_${rawUid}`;
  const visorId = `statyVisor_${rawUid}`;
  const badgeId = `statyWaveBadge_${rawUid}`;

  const [hovering, setHovering] = useState(false);
  const [playfulOverride, setPlayfulOverride] = useState<StatyExpression | null>(null);
  const [playfulGesture, setPlayfulGesture] = useState<StatyGesture | null>(null);
  const [tipIndex, setTipIndex] = useState(0);

  const activeExpression: StatyExpression =
    playfulOverride ?? (hovering && expression === 'idle' ? 'happy' : expression);

  // Derive natural gesture from expression if caller leaves gesture as 'none'
  const resolvedGesture: StatyGesture =
    playfulGesture ??
    (gesture !== 'none'
      ? gesture
      : activeExpression === 'thinking' || activeExpression === 'confused'
        ? 'tilt'
        : activeExpression === 'processing' || activeExpression === 'listening'
          ? 'ear-perk'
          : activeExpression === 'explaining'
            ? 'nod'
            : activeExpression === 'excited' || activeExpression === 'success'
              ? 'bounce'
              : activeExpression === 'error'
                ? 'shake'
                : activeExpression === 'greeting' || activeExpression === 'goodbye'
                  ? 'wave-wink'
                  : 'none');

  const sizeMap: Record<NonNullable<StatyMascotProps['size']>, string> = {
    xs: 'w-9 h-9',
    sm: 'w-14 h-14',
    md: variant === 'head' ? 'w-20 h-20' : 'w-28 h-28',
    lg: variant === 'head' ? 'w-28 h-28' : 'w-40 h-40',
    xl: variant === 'head' ? 'w-36 h-36' : 'w-52 h-52',
  };

  const handleHeadClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!interactive) return;
    setPlayfulOverride('excited');
    setPlayfulGesture('bounce');
    window.setTimeout(() => {
      setPlayfulOverride(null);
      setPlayfulGesture(null);
    }, 1200);
    onMascotClick?.();
  };

  const handleBodyClick = () => {
    if (!interactive) return;
    if (variant === 'head') {
      setPlayfulOverride('happy');
      setPlayfulGesture('wave-wink');
      window.setTimeout(() => {
        setPlayfulOverride(null);
        setPlayfulGesture(null);
      }, 1200);
      onMascotClick?.();
      return;
    }
    const nextIdx = (tipIndex + 1) % RESEARCH_TIPS.length;
    setTipIndex(nextIdx);
    setPlayfulOverride('explaining');
    setPlayfulGesture('nod');
    onTipChange?.(RESEARCH_TIPS[nextIdx]);
    window.setTimeout(() => {
      setPlayfulOverride(null);
      setPlayfulGesture(null);
    }, 1600);
  };

  const headGestureClass =
    resolvedGesture === 'nod'
      ? 'staty-gesture-nod'
      : resolvedGesture === 'tilt'
        ? 'staty-gesture-tilt'
        : resolvedGesture === 'bounce'
          ? 'staty-gesture-bounce'
          : resolvedGesture === 'shake'
            ? 'staty-gesture-shake'
            : '';

  const earGestureClass =
    resolvedGesture === 'ear-perk' ? 'staty-ear-perk' : 'staty-ear-right';

  const isWaving =
    activeExpression === 'greeting' ||
    activeExpression === 'goodbye' ||
    activeExpression === 'excited' ||
    resolvedGesture === 'wave-wink';

  const renderEyes = () => {
    switch (activeExpression) {
      case 'happy':
      case 'greeting':
        return (
          <g>
            {/* Happy curved glowing eyes */}
            <path d="M90 107 Q100 98 110 107" stroke="#7DD3FC" strokeWidth="7.5" strokeLinecap="round" fill="none" />
            <path d="M130 107 Q140 98 150 107" stroke="#7DD3FC" strokeWidth="7.5" strokeLinecap="round" fill="none" />
            <path d="M90 107 Q100 98 110 107" stroke="#E0F2FE" strokeWidth="3" strokeLinecap="round" fill="none" />
            <path d="M130 107 Q140 98 150 107" stroke="#E0F2FE" strokeWidth="3" strokeLinecap="round" fill="none" />
            {/* Subtle glowing cheek dots */}
            <ellipse cx="87" cy="118" rx="4.5" ry="2.2" fill="#38BDF8" fillOpacity="0.45" />
            <ellipse cx="153" cy="118" rx="4.5" ry="2.2" fill="#38BDF8" fillOpacity="0.45" />
          </g>
        );
      case 'excited':
      case 'success':
        return (
          <g>
            <path d="M89 107 Q99 95 109 107" stroke="#38BDF8" strokeWidth="8" strokeLinecap="round" fill="none" />
            <path d="M131 107 Q141 95 151 107" stroke="#38BDF8" strokeWidth="8" strokeLinecap="round" fill="none" />
            <path d="M89 107 Q99 95 109 107" stroke="#F0F9FF" strokeWidth="3" strokeLinecap="round" fill="none" />
            <path d="M131 107 Q141 95 151 107" stroke="#F0F9FF" strokeWidth="3" strokeLinecap="round" fill="none" />
            {/* Tiny celebration stars */}
            <circle cx="88" cy="91" r="2.2" fill="#FACC15" className="staty-pulse-glow" />
            <circle cx="152" cy="91" r="2.2" fill="#34D399" className="staty-pulse-glow" />
            {/* Cute digital smile */}
            <path d="M113 118 Q120 124 127 118" stroke="#7DD3FC" strokeWidth="2.8" strokeLinecap="round" fill="none" />
          </g>
        );
      case 'thinking':
        return (
          <g>
            <rect x="89" y="102" width="21" height="10" rx="5" fill="#60A5FA" />
            <rect x="92" y="104" width="15" height="6" rx="3" fill="#BAE6FD" />
            <rect x="130" y="98" width="21" height="13" rx="6" fill="#60A5FA" />
            <rect x="133" y="100" width="15" height="8" rx="4" fill="#BAE6FD" />
            <circle cx="155" cy="87" r="3" fill="#FACC15" className="staty-pulse-glow" />
            <circle cx="163" cy="80" r="2.2" fill="#FACC15" className="staty-pulse-glow" />
          </g>
        );
      case 'processing':
        return (
          <g>
            {/* Bright cyber visor eyes + live processing wave bars */}
            <rect x="89" y="99" width="21" height="11" rx="5.5" fill="#38BDF8" className="staty-pulse-glow" />
            <rect x="93" y="101" width="13" height="6.5" rx="3.2" fill="#E0F2FE" />
            <rect x="130" y="99" width="21" height="11" rx="5.5" fill="#38BDF8" className="staty-pulse-glow" />
            <rect x="134" y="101" width="13" height="6.5" rx="3.2" fill="#E0F2FE" />
            <circle cx="110" cy="121" r="2.4" fill="#60A5FA" className="staty-pulse-glow" />
            <circle cx="120" cy="121" r="2.4" fill="#7DD3FC" className="staty-pulse-glow" />
            <circle cx="130" cy="121" r="2.4" fill="#60A5FA" className="staty-pulse-glow" />
          </g>
        );
      case 'confused':
        return (
          <g>
            <circle cx="99" cy="105" r="8" fill="#60A5FA" />
            <circle cx="99" cy="105" r="4" fill="#BAE6FD" />
            <rect x="130" y="103" width="21" height="6" rx="3" fill="#60A5FA" />
            <text x="152" y="93" fontSize="14" fontWeight="700" fill="#FACC15">?</text>
          </g>
        );
      case 'error':
        return (
          <g>
            <path d="M90 101 L106 109 M106 101 L90 109" stroke="#FCA5A5" strokeWidth="4.5" strokeLinecap="round" />
            <path d="M134 101 L150 109 M150 101 L134 109" stroke="#FCA5A5" strokeWidth="4.5" strokeLinecap="round" />
            <path d="M113 122 Q120 116 127 122" stroke="#FCA5A5" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          </g>
        );
      case 'explaining':
        return (
          <g className="staty-blink">
            <rect x="89" y="98" width="22" height="13" rx="6.5" fill="#38BDF8" />
            <rect x="93" y="100" width="14" height="8" rx="4" fill="#E0F2FE" />
            <rect x="129" y="98" width="22" height="13" rx="6.5" fill="#38BDF8" />
            <rect x="133" y="100" width="14" height="8" rx="4" fill="#E0F2FE" />
            {/* Small friendly speaking arc */}
            <path d="M114 119 Q120 124 126 119" stroke="#7DD3FC" strokeWidth="2.8" strokeLinecap="round" fill="none" />
          </g>
        );
      case 'listening':
        return (
          <g>
            <rect x="88" y="97" width="23" height="15" rx="7.5" fill="#38BDF8" />
            <rect x="92" y="100" width="15" height="9" rx="4.5" fill="#F0F9FF" />
            <rect x="129" y="97" width="23" height="15" rx="7.5" fill="#38BDF8" />
            <rect x="133" y="100" width="15" height="9" rx="4.5" fill="#F0F9FF" />
          </g>
        );
      case 'goodbye':
        return (
          <g>
            <path d="M90 106 Q100 100 110 106" stroke="#7DD3FC" strokeWidth="6" strokeLinecap="round" fill="none" />
            <rect x="130" y="101" width="20" height="11" rx="5.5" fill="#60A5FA" />
          </g>
        );
      case 'blinking':
        return (
          <g>
            <rect x="89" y="105" width="21" height="3.5" rx="1.75" fill="#7DD3FC" />
            <rect x="130" y="105" width="21" height="3.5" rx="1.75" fill="#7DD3FC" />
          </g>
        );
      case 'idle':
      default:
        return (
          <g className="staty-blink">
            <rect x="89" y="100" width="21" height="12" rx="6" fill="#60A5FA" />
            <rect x="92" y="102" width="15" height="7.5" rx="3.75" fill="#BAE6FD" />
            <rect x="130" y="100" width="21" height="12" rx="6" fill="#60A5FA" />
            <rect x="133" y="102" width="15" height="7.5" rx="3.75" fill="#BAE6FD" />
          </g>
        );
    }
  };

  const visorTrimColor =
    activeExpression === 'error'
      ? '#F87171'
      : activeExpression === 'success' || activeExpression === 'excited'
        ? '#38BDF8'
        : '#3B82F6';

  const headSvgMarkup = (
    <g className={headGestureClass} onClick={handleHeadClick}>
      {/* Left Blue Fox Ear */}
      <g className={resolvedGesture === 'ear-perk' ? 'staty-ear-perk' : ''}>
        <path
          d="M78 86 L68 28 C67 20 77 16 83 22 L114 58 Z"
          fill={`url(#${blueId})`}
        />
        <path d="M82 76 L76 38 L104 60 Z" fill="#FFFFFF" />
        <path d="M85 71 L82 48 L98 61 Z" fill="#A5B4FC" />
      </g>

      {/* Right Blue Fox Ear */}
      <g className={earGestureClass}>
        <path
          d="M162 86 L172 28 C173 20 163 16 157 22 L126 58 Z"
          fill={`url(#${blueId})`}
        />
        <path d="M158 76 L164 38 L136 60 Z" fill="#FFFFFF" />
        <path d="M155 71 L158 48 L142 61 Z" fill="#A5B4FC" />
      </g>

      {/* Outer Blue Hood */}
      <ellipse cx="120" cy="100" rx="58" ry="49" fill={`url(#${blueId})`} />
      {/* White Hood Face Brim */}
      <path
        d="M70 104 C70 72 92 54 120 54 C148 54 170 72 170 104 C170 132 148 148 120 148 C92 148 70 132 70 104 Z"
        fill="#FFFFFF"
      />

      {/* Tiny Fox Hood Eyes & Triangle Nose */}
      <circle cx="105" cy="67" r="3" fill="#0F172A" />
      <circle cx="135" cy="67" r="3" fill="#0F172A" />
      <path d="M114 70 H126 L120 78 Z" fill="#0F172A" />

      {/* Side Glowing Blue Earphone Trim */}
      <rect
        x="73"
        y="92"
        width="6"
        height="28"
        rx="3"
        fill={visorTrimColor}
        className={activeExpression === 'processing' || activeExpression === 'listening' ? 'staty-pulse-glow' : ''}
      />
      <rect
        x="161"
        y="92"
        width="6"
        height="28"
        rx="3"
        fill={visorTrimColor}
        className={activeExpression === 'processing' || activeExpression === 'listening' ? 'staty-pulse-glow' : ''}
      />

      {/* Glossy Black Digital Face Screen */}
      <rect x="78" y="80" width="84" height="54" rx="22" fill={`url(#${visorId})`} />
      <path
        d="M88 86 Q120 82 152 86"
        stroke="#FFFFFF"
        strokeOpacity="0.14"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Animated Glowing Light-Blue Eyes */}
      {renderEyes()}
    </g>
  );

  return (
    <div
      className={`relative inline-flex items-center justify-center select-none ${sizeMap[size]} ${className}`}
      onMouseEnter={() => interactive && setHovering(true)}
      onMouseLeave={() => interactive && setHovering(false)}
      role={interactive ? 'button' : 'img'}
      tabIndex={interactive ? 0 : undefined}
      aria-label={`STATY robotic fox mascot (${activeExpression})`}
      onClick={handleBodyClick}
      onKeyDown={(e) => {
        if (interactive && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          handleBodyClick();
        }
      }}
    >
      <svg
        viewBox={variant === 'head' ? '48 14 144 140' : '0 0 240 240'}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`w-full h-full drop-shadow-sm ${interactive ? 'cursor-pointer' : ''} staty-float`}
      >
        <defs>
          <linearGradient id={blueId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#60A5FA" />
            <stop offset="100%" stopColor="#2563EB" />
          </linearGradient>
          <linearGradient id={visorId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0F172A" />
            <stop offset="100%" stopColor="#020617" />
          </linearGradient>
          <linearGradient id={badgeId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3B82F6" />
            <stop offset="100%" stopColor="#818CF8" />
          </linearGradient>
        </defs>

        {variant === 'head' ? (
          <>
            <ellipse cx="120" cy="148" rx="34" ry="4.5" fill="#173B75" fillOpacity="0.12" />
            {headSvgMarkup}
          </>
        ) : (
          <>
            {/* Ground Shadow */}
            <ellipse cx="120" cy="222" rx="52" ry="8" fill="#173B75" fillOpacity="0.12" />

            {/* Blue-and-white jagged fox tail */}
            <g className="staty-tail">
              <path
                d="M150 185 C182 188 206 168 202 136 C200 124 190 120 184 128 C176 138 164 148 150 162 Z"
                fill={`url(#${blueId})`}
              />
              <path
                d="M188 124 C196 122 203 130 202 140 C197 148 190 144 185 151 C179 144 176 146 171 140 C176 132 183 126 188 124 Z"
                fill="#FFFFFF"
              />
            </g>

            {/* Feet / Paws */}
            <ellipse cx="96" cy="208" rx="19" ry="11" fill="#F1F5F9" stroke="#CBD5E1" strokeWidth="1.5" />
            <ellipse cx="144" cy="208" rx="19" ry="11" fill="#F1F5F9" stroke="#CBD5E1" strokeWidth="1.5" />

            {/* Robotic Fox Body (Blue & White Hoodie Suit) */}
            <path
              d="M84 152 C80 176 82 202 96 204 L112 204 L116 190 L124 190 L128 204 L144 204 C158 202 160 176 156 152 Z"
              fill={`url(#${blueId})`}
            />
            <path
              d="M96 152 C92 172 95 194 120 194 C145 194 148 172 144 152 Z"
              fill="#FFFFFF"
            />
            <line x1="120" y1="154" x2="120" y2="194" stroke="#CBD5E1" strokeWidth="1.5" />

            {/* Right Arm */}
            <path
              d="M152 152 C168 158 174 176 164 186 C158 192 148 184 148 172 Z"
              fill="#FFFFFF"
              stroke="#E2E8F0"
              strokeWidth="1.5"
            />

            {/* Left Arm (Waving Paw on Greeting / Goodbye / Excited) */}
            <g className={isWaving ? 'staty-wave' : ''}>
              <path
                d="M88 152 C68 144 52 126 56 112 C60 100 74 102 80 116 L90 138 Z"
                fill="#FFFFFF"
                stroke="#E2E8F0"
                strokeWidth="1.5"
              />
              <ellipse cx="66" cy="119" rx="5" ry="4" fill="#60A5FA" />
              <circle cx="60" cy="111" r="2.2" fill="#60A5FA" />
              <circle cx="66" cy="109" r="2.2" fill="#60A5FA" />
              <circle cx="71" cy="112" r="2.2" fill="#60A5FA" />
            </g>

            {/* Hoodie Collar & Drawstrings */}
            <path d="M88 148 Q120 162 152 148" stroke="#60A5FA" strokeWidth="6" strokeLinecap="round" fill="none" />
            <line x1="104" y1="154" x2="102" y2="176" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" />
            <line x1="136" y1="154" x2="138" y2="176" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" />
            <circle cx="102" cy="177" r="2.2" fill="#1E293B" />
            <circle cx="138" cy="177" r="2.2" fill="#1E293B" />

            {/* Square Chest Badge */}
            <rect x="108" y="147" width="24" height="22" rx="6" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="1.5" />
            <path
              d="M113 160 Q117 154 120 158 T127 156"
              stroke={`url(#${badgeId})`}
              strokeWidth="3.2"
              strokeLinecap="round"
              fill="none"
            />

            {headSvgMarkup}
          </>
        )}
      </svg>
    </div>
  );
};
