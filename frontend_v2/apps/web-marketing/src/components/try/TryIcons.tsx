interface IconProps {
  className?: string;
}

export function TryGiftIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3.5" y="9" width="17" height="4" rx="1" />
      <rect x="4.5" y="13" width="15" height="8" rx="1" />
      <path d="M12 9v12" />
      <path d="M12 9C9.5 9 8 7.6 8 6a2.4 2.4 0 0 1 4-1.8C13 3 12 9 12 9z" />
      <path d="M12 9c2.5 0 4-1.4 4-3a2.4 2.4 0 0 0-4-1.8C11 3 12 9 12 9z" />
    </svg>
  );
}

export function TryPersonAddIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="10" cy="7.5" r="3.5" />
      <path d="M3.5 20c.7-3.6 3.3-5.5 6.5-5.5s5.8 1.9 6.5 5.5" />
      <path d="M18.5 8v6M15.5 11h6" />
    </svg>
  );
}

export function TryBoxIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M12 3 4 7v10l8 4 8-4V7z" />
      <path d="M4 7l8 4 8-4M12 11v10" />
    </svg>
  );
}

export function TryChatIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M4 5.5h16v10H9.5L5.5 19v-3.5H4z" />
      <path d="M8 9.5h8M8 12.5h5" />
    </svg>
  );
}

export function TryCheckCircleIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.4 2.4 4.6-5" />
    </svg>
  );
}

export function TryChevronIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 12 20" fill="none" aria-hidden>
      <path d="M2 2l8 8-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TryFilledArrowIcon({ className = 'h-5 w-6' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 16" fill="currentColor" aria-hidden>
      <path d="M1.25 6.15h11.4V3.55c0-.72.82-1.14 1.4-.72l8.55 5.17c.55.33.55 1.11 0 1.44l-8.55 5.17c-.58.42-1.4 0-1.4-.72V9.85H1.25A1.25 1.25 0 0 1 0 8.6V7.4c0-.69.56-1.25 1.25-1.25z" />
    </svg>
  );
}

export function TryCardIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18" />
    </svg>
  );
}

export function TrySparkleIcon({ className = 'h-8 w-10' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 40 32" fill="none" aria-hidden>
      <path d="M8 4v11M2.5 9.5h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M23 2v9M18.5 6.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M33 12v9M28.5 16.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
