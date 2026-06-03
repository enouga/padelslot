'use client';

interface LogoProps {
  /** hauteur du mark en px (le wordmark se dimensionne en proportion) */
  size?: number;
  /** 'full' = mark + wordmark · 'mark' = symbole seul */
  variant?: 'full' | 'mark';
  /** 'ink' (défaut, fonds clairs) · 'light' (fonds foncés) */
  tone?: 'ink' | 'light';
  className?: string;
}

/** Mark Palova — balle monoligne. Couleur via `currentColor`. */
function Mark({ px }: { px: number }) {
  return (
    <svg width={px} height={px} viewBox="0 0 100 100" aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
      <g fill="none" stroke="currentColor" strokeWidth={6.5} strokeLinecap="round">
        <circle cx="50" cy="50" r="37" />
        <path d="M20 30 Q50 50 20 70" />
        <path d="M80 30 Q50 50 80 70" />
      </g>
    </svg>
  );
}

export default function Logo({ size = 34, variant = 'full', tone = 'ink', className = '' }: LogoProps) {
  const markColor = tone === 'light' ? 'text-brand-300' : 'text-brand-500';
  const inkColor  = tone === 'light' ? 'text-paper'     : 'text-ink';

  if (variant === 'mark') {
    return <span className={`${markColor} ${className}`} aria-label="Palova"><Mark px={size} /></span>;
  }

  return (
    <span className={`inline-flex items-end gap-[0.28em] ${className}`} aria-label="Palova">
      <span className={markColor}><Mark px={size} /></span>
      <span
        className={`${inkColor} font-bold leading-none`}
        style={{ fontSize: size * 0.82, letterSpacing: '-0.04em' }}
      >
        palova<span
          className="inline-block rounded-full bg-accent-400 align-baseline"
          style={{ width: size * 0.085, height: size * 0.085, marginLeft: size * 0.05, marginBottom: size * 0.06 }}
        />
      </span>
    </span>
  );
}
