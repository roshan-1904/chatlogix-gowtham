/** Authentic WhatsApp mobile surfaces for marketing demos (vendor POV). */
export const wa = {
  header: '#008069',
  headerDark: '#075E54',
  canvas: '#e5ddd5',
  listBg: '#ffffff',
  listDivider: '#e9edef',
  composerBg: '#f0f2f5',
  text: '#111b21',
  muted: '#667781',
  unread: '#25D366',
  customerBubble: 'rounded-lg rounded-tl-none bg-white text-[#111b21]',
  shopBubble: 'rounded-lg rounded-tr-none bg-[#d9fdd3] text-[#111b21]',
  shadow: 'shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]',
} as const;

export function formatWaTime(hour: number, minute: number): string {
  const h = hour % 12 || 12;
  const ampm = hour >= 12 ? 'pm' : 'am';
  return `${h}:${minute.toString().padStart(2, '0')} ${ampm}`;
}
