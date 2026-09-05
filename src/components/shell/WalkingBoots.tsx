/**
 * WalkingBoots — a themed "throbber" for time-consuming background work
 * (e.g. switching the dashboard from "this season" to "all time").
 *
 * Two hiking-boot silhouettes take alternating steps — a bob + heel-tilt —
 * to read as walking. Monochrome via `currentColor`, so it inherits the
 * surrounding text color and works in light and dark themes. Purely
 * decorative: marked aria-hidden, with an accessible label on the wrapper.
 */

interface WalkingBootsProps {
  /** Boot height in px (both boots scale together). Default 22. */
  size?: number
  /** Accessible status text announced to screen readers. Default "Loading". */
  label?: string
  /** Extra classes for the wrapper (e.g. text color, spacing). */
  className?: string
}

/** Right-facing chunky hiking boot: padded upper + lugged sole, drawn in a 32×32 box. */
function Boot({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="pwv-boot"
      aria-hidden="true"
    >
      {/* upper + foot */}
      <path
        d="M6 5h5a2 2 0 0 1 2 2v8h8a5 5 0 0 1 5 5v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"
        fill="currentColor"
        opacity="0.9"
      />
      {/* laces highlight */}
      <path
        d="M8.5 8.5h2M8.5 11h2M8.5 13.5h2"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity="0.35"
        className="pwv-boot-laces"
      />
      {/* sole */}
      <path
        d="M4 22h23a1 1 0 0 1 1 1v1.5a2.5 2.5 0 0 1-2.5 2.5H5.5A2.5 2.5 0 0 1 3 24.5V23a1 1 0 0 1 1-1z"
        fill="currentColor"
      />
    </svg>
  )
}

export function WalkingBoots({ size = 22, label = 'Loading', className = '' }: WalkingBootsProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={label}
      className={`pwv-walking-boots inline-flex items-end gap-1 ${className}`}
    >
      <span className="pwv-boot-wrap pwv-boot-a">
        <Boot size={size} />
      </span>
      <span className="pwv-boot-wrap pwv-boot-b">
        <Boot size={size} />
      </span>
      <style>{`
        .pwv-boot-wrap {
          display: inline-flex;
          transform-origin: 90% 90%;
          animation: pwv-boot-step 0.9s ease-in-out infinite;
        }
        .pwv-boot-b { animation-delay: 0.45s; }
        @keyframes pwv-boot-step {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          20%      { transform: translateY(-32%) rotate(-12deg); }
          45%      { transform: translateY(0) rotate(0deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .pwv-boot-wrap {
            animation: pwv-boot-fade 1.2s ease-in-out infinite;
          }
          .pwv-boot-b { animation-delay: 0.6s; }
          @keyframes pwv-boot-fade {
            0%, 100% { opacity: 0.35; }
            50%      { opacity: 1; }
          }
        }
      `}</style>
    </span>
  )
}
