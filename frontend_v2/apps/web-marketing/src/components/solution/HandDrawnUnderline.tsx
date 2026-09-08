export function HandDrawnUnderline({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`pointer-events-none absolute left-0 top-[1.05em] h-[0.7em] w-full overflow-visible text-[#128C7E] ${className}`}
      viewBox="0 0 100 14"
      fill="none"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d="M3 4C35 -1 64 14 97 9.5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M4 10C35 -1 64 20 97 13.5"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
    </svg>
  );
}
