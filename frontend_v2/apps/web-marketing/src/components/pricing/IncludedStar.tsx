interface IncludedStarProps {
  className?: string;
}

/** Filled star in `warning-500` gold — used on the pricing included list. */
export function IncludedStar({ className = 'h-3.5 w-3.5' }: IncludedStarProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2.4l2.72 6.18 6.73.58-5.14 4.45 1.56 6.57L12 16.7l-5.87 3.48 1.56-6.57-5.14-4.45 6.73-.58L12 2.4z" />
    </svg>
  );
}
