import React from 'react';

interface BrandLogoProps {
  layout?: 'vertical' | 'horizontal';
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
}

export const FoxHeadMark: React.FC<{ className?: string }> = ({ className = 'w-9 h-9' }) => (
  <svg
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <rect width="64" height="64" rx="16" fill="#173B75" />
    {/* Fox Ears */}
    <path d="M16 30 L13 12 C12.8 10 15 9 16.5 10.5 L27 20 Z" fill="#3B82F6" />
    <path d="M48 30 L51 12 C51.2 10 49 9 47.5 10.5 L37 20 Z" fill="#3B82F6" />
    <path d="M17.5 26 L15.5 15 L24 21 Z" fill="#FFFFFF" />
    <path d="M46.5 26 L48.5 15 L40 21 Z" fill="#FFFFFF" />
    <path d="M18.5 25 L17.3 18.5 L22.5 21.8 Z" fill="#A5B4FC" />
    <path d="M45.5 25 L46.7 18.5 L41.5 21.8 Z" fill="#A5B4FC" />
    {/* White Hood Face */}
    <path
      d="M13 34 C13 23.5 21 17 32 17 C43 17 51 23.5 51 34 C51 43.5 43.5 49.5 32 49.5 C20.5 49.5 13 43.5 13 34 Z"
      fill="#FFFFFF"
    />
    {/* Tiny Hood Eyes & Nose */}
    <circle cx="27.5" cy="21" r="1.2" fill="#0F172A" />
    <circle cx="36.5" cy="21" r="1.2" fill="#0F172A" />
    <path d="M30 22.3 H34 L32 25 Z" fill="#0F172A" />
    {/* Glossy Black Digital Visor */}
    <rect x="17.5" y="27" width="29" height="17" rx="7" fill="#0B1120" />
    {/* Glowing Light-Blue Eyes */}
    <rect x="21.5" y="32.5" width="7" height="4.5" rx="2.2" fill="#60A5FA" />
    <rect x="22.3" y="33.1" width="5.4" height="3" rx="1.5" fill="#BAE6FD" />
    <rect x="35.5" y="32.5" width="7" height="4.5" rx="2.2" fill="#60A5FA" />
    <rect x="36.3" y="33.1" width="5.4" height="3" rx="1.5" fill="#BAE6FD" />
  </svg>
);

export const BrandLogo: React.FC<BrandLogoProps> = ({
  layout = 'horizontal',
  size = 'md',
  showTagline = false,
}) => {
  const iconSizes = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
  };

  const titleSizes = {
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-2xl',
  };

  if (layout === 'vertical') {
    return (
      <div className="flex flex-col items-center text-center gap-2">
        <FoxHeadMark className={iconSizes[size]} />
        <div>
          <span
            className={`font-display font-extrabold tracking-tight text-[#173B75] dark:text-white ${titleSizes[size]}`}
          >
            STATLYTICS
          </span>
          {showTagline && (
            <p className="mt-1 text-xs font-medium tracking-wide text-slate-500 dark:text-slate-400">
              Analyze. Interpret. Innovate.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 shrink-0">
      <FoxHeadMark className={iconSizes[size]} />
      <span
        className={`font-display font-extrabold tracking-tight text-[#173B75] dark:text-white whitespace-nowrap ${titleSizes[size]}`}
      >
        STATLYTICS
      </span>
    </div>
  );
};
