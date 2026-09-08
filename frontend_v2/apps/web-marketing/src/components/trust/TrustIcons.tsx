interface IconProps {
  className?: string;
}

export function TrustLockIcon({ className = 'h-3.5 w-3.5' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function TrustCatalogIcon({ className = 'h-3.5 w-3.5' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <path d="M8 7h8M8 11h8" />
    </svg>
  );
}

export function TrustTagIcon({ className = 'h-3.5 w-3.5' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M12 2 2 12l9 9 10-10V2h-9z" />
      <circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function TrustStockIcon({ className = 'h-3.5 w-3.5' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
      <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </svg>
  );
}

export function TrustTruckIcon({ className = 'h-3.5 w-3.5' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M3 7h11v10H3zM14 11h4l3 3v3h-7" />
      <circle cx="7" cy="18" r="1.6" />
      <circle cx="18" cy="18" r="1.6" />
    </svg>
  );
}

export function TrustPolicyIcon({ className = 'h-3.5 w-3.5' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M7 3h8l5 5v13H7z" />
      <path d="M15 3v5h5M10 13h6M10 17h4" />
    </svg>
  );
}

export function TrustBrainIcon({ className = 'h-6 w-6' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M9.5 5a3 3 0 0 0-3 3v.5A3 3 0 0 0 4 11.5 2.5 2.5 0 0 0 6 14v1.5A3 3 0 0 0 9 18.5h.5" />
      <path d="M14.5 5a3 3 0 0 1 3 3v.5A3 3 0 0 1 20 11.5 2.5 2.5 0 0 1 18 14v1.5A3 3 0 0 1 15 18.5h-.5" />
      <path d="M12 5v14M9.5 9.5h5M9.5 13h5" />
    </svg>
  );
}

export function TrustCheckIcon({ className = 'h-3.5 w-3.5' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.4 2.4 4.6-5" />
    </svg>
  );
}

export function TrustShieldIcon({ className = 'h-8 w-8' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2 4.5 5.2v6.3c0 4.9 3.2 9.2 7.5 10.5 4.3-1.3 7.5-5.6 7.5-10.5V5.2L12 2z"
      />
      <path fill="#fff" d="M10.3 14.6 7.8 12.1l1.2-1.2 1.3 1.3 3.7-3.7 1.2 1.2-4.9 4.9z" />
    </svg>
  );
}

export function TrustDoubleCheckIcon({ className = 'h-3 w-3.5' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 11" fill="none" aria-hidden>
      <path d="m1 5.5 2.8 3.2L9.8 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m5.6 5.5 2.8 3.2L14.4 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TrustArrowIcon({ className = 'h-5 w-7' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 28 20" fill="none" aria-hidden>
      <path d="M2 10H16" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M12 5L20 10L12 15" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
