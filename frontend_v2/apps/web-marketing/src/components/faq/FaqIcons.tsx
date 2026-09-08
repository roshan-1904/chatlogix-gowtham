interface IconProps {
  className?: string;
}

export function FaqRocketIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M12 2.5c3.5 1.6 5.5 5 5.5 9 0 2.6-1 4.8-2.4 6.3L12 20l-3.1-2.2C7.5 16.3 6.5 14.1 6.5 11.5c0-4 2-7.4 5.5-9z" />
      <circle cx="12" cy="10.5" r="2" />
      <path d="M8.3 15.5 5.5 18M15.7 15.5 18.5 18M9.5 19.5 12 22l2.5-2.5" />
    </svg>
  );
}

export function FaqMessageIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M4 5.5h16v10H10L5.5 19v-3.5H4z" />
      <circle cx="8.5" cy="10.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="10.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="10.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function FaqCartIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M3 4h2.2l1 3M6.2 7h14l-2 8H8.5z" />
      <path d="M8.5 15 6.2 7" />
      <circle cx="9.5" cy="20" r="1.4" />
      <circle cx="17" cy="20" r="1.4" />
    </svg>
  );
}
