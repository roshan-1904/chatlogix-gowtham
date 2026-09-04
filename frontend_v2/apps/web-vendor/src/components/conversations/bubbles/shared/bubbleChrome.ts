export type BubbleVariant = 'incoming' | 'outgoing';

export function getBubbleVariant(senderType: string): BubbleVariant {
  return senderType === 'customer' ? 'incoming' : 'outgoing';
}

export function isAiSender(senderType: string): boolean {
  return senderType === 'ai';
}

export function bubbleAlignClass(variant: BubbleVariant): string {
  return variant === 'incoming' ? 'items-start' : 'items-end';
}

/** WhatsApp-style surfaces: white inbound, mint outbound. */
export function bubbleSurfaceClass(variant: BubbleVariant): string {
  return variant === 'incoming'
    ? 'bg-white text-[#111b21]'
    : 'bg-[#d9fdd3] text-[#111b21]';
}

export function bubbleCornerClass(variant: BubbleVariant): string {
  return variant === 'incoming'
    ? 'rounded-2xl rounded-tl-sm'
    : 'rounded-2xl rounded-tr-sm';
}

export function bubbleMetaClass(): string {
  return 'text-[#667781]';
}

export function bubbleShadowClass(): string {
  return 'shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]';
}

export function innerCardClass(): string {
  return 'bg-black/[0.04]';
}

export function bubbleLinkClass(): string {
  return 'text-[#027eb5] hover:underline';
}
