const AVATAR_PALETTE = [
  { bg: 'bg-[#e17076]', text: 'text-white' },
  { bg: 'bg-[#00a884]', text: 'text-white' },
  { bg: 'bg-[#65aadd]', text: 'text-white' },
  { bg: 'bg-[#a695e7]', text: 'text-white' },
  { bg: 'bg-[#ee7aae]', text: 'text-white' },
  { bg: 'bg-[#6ec9cb]', text: 'text-white' },
  { bg: 'bg-[#f6c359]', text: 'text-[#072349]' },
  { bg: 'bg-[#072349]', text: 'text-white' },
] as const;

export function getInitials(nameOrPhone: string): string {
  const parts = nameOrPhone.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function getAvatarClasses(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const { bg, text } = AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
  return `${bg} ${text}`;
}
