interface LogoProps {
  size?: number;
}

/** Probability-meter mark: a filled span, a remainder, and the calibration needle at the split. */
export function Logo({ size = 28 }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="Decision Bench"
    >
      <rect width="32" height="32" rx="7" className="fill-ink" />
      <rect x="5" y="13" width="14" height="6" rx="3" className="fill-fast" />
      <rect x="20" y="13" width="7" height="6" rx="3" fill="oklch(0.42 0.015 250)" />
      <rect x="18.1" y="6.5" width="1.8" height="19" rx="0.9" className="fill-ink" />
      <rect x="18.55" y="7" width="0.9" height="18" rx="0.45" className="fill-paper" />
    </svg>
  );
}
