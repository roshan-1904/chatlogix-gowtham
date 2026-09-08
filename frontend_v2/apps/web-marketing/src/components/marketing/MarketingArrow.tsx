export function ArrowCurve({
  className = '',
  flip = false,
}: {
  className?: string;
  flip?: boolean;
}) {
  return (
    <svg
      width="95"
      height="60"
      viewBox="0 0 95 60"
      fill="none"
      className={`${flip ? 'scale-x-[-1]' : ''} ${className}`}
      aria-hidden
    >
      <path
        d="M5 10C34 8 60 17 68 37C71 45 67 51 58 55"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M58 55L70 49M58 55L60 42"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MarketingArrow({
  direction = 'right',
  className = '',
}: {
  direction?: 'right' | 'down' | 'curve';
  className?: string;
}) {
  if (direction === 'curve') {
    return <ArrowCurve className={className} />;
  }

  if (direction === 'down') {
    return (
      <svg className={className} width="40" height="60" viewBox="0 0 40 60" fill="none" aria-hidden>
        <path d="M20 4C20 20 20 34 20 48" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path
          d="M13 41L20 50L27 41"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg className={className} width="42" height="24" viewBox="0 0 42 24" fill="none" aria-hidden>
      <path d="M3 12H34" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M27 5L35 12L27 19"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
