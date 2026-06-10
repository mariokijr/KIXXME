import React from "react";

interface KixxMeLogoProps {
  /** Height (and width of the glyph/badge) in px. */
  size?: number;
  /** Render the "KIXXME" wordmark next to the glyph. */
  withWordmark?: boolean;
  /** Wrap the glyph in a rounded-square neon badge (app-icon style). */
  badge?: boolean;
  /** Apply a neon drop-shadow glow. Default true. */
  glow?: boolean;
  className?: string;
}

/**
 * KixxMe brand mark: a neon "K" whose upper arm rises into an integrated
 * location pin — the official emblem. Replaces the old fire iconography.
 */
export function KixxMeLogo({
  size = 40,
  withWordmark = false,
  badge = false,
  glow = true,
  className,
}: KixxMeLogoProps) {
  const uid = React.useId().replace(/:/g, "");
  const gradId = `kx-grad-${uid}`;

  const glyph = (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={
        glow
          ? { filter: "drop-shadow(0 0 6px rgba(192,80,233,0.55))" }
          : undefined
      }
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={gradId}
          x1="8"
          y1="6"
          x2="40"
          y2="42"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="hsl(273,90%,63%)" />
          <stop offset="0.55" stopColor="hsl(312,88%,61%)" />
          <stop offset="1" stopColor="hsl(330,92%,58%)" />
        </linearGradient>
      </defs>

      {badge && (
        <rect
          x="1.5"
          y="1.5"
          width="45"
          height="45"
          rx="12"
          fill="hsl(258,42%,7%)"
          stroke={`url(#${gradId})`}
          strokeWidth="2.5"
        />
      )}

      <g transform={badge ? "translate(7.4 8.5) scale(0.69)" : undefined}>
        <g
          stroke={`url(#${gradId})`}
          strokeWidth="4.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* K stem */}
          <path d="M16 11 V 39" />
          {/* K lower arm */}
          <path d="M16 25 L 31 39" />
          {/* K upper arm rising into the pin's tip */}
          <path d="M16 25 L 28 18" />
          {/* location pin — a teardrop map marker planted on the K */}
          <path d="M28 18 C 22 13 22.5 4.5 28 4.5 C 33.5 4.5 34 13 28 18 Z" />
        </g>
        {/* pin marker center */}
        <circle cx="28" cy="9.4" r="2.1" fill={`url(#${gradId})`} />
      </g>
    </svg>
  );

  if (!withWordmark) {
    return <span className={className}>{glyph}</span>;
  }

  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      {glyph}
      <span
        className="font-display tracking-tight text-gradient-brand leading-none"
        style={{ fontSize: Math.round(size * 1.05) }}
      >
        KIXXME
      </span>
    </span>
  );
}

export default KixxMeLogo;
