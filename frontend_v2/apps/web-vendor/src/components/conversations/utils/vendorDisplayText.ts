/**
 * Vendor-portal display helpers for dual-language message bubbles.
 */

import { dualLanguageDisplay } from './messageText';

/** English-only snippet for list/quoted preview (contentEn when available). */
export function vendorSnippet(content: string, contentEn?: string | null): string {
  return (contentEn ?? content).trim();
}

/** True when the thread should show English first with original underneath. */
export function showDualLanguage(original: string, contentEn?: string | null): boolean {
  return dualLanguageDisplay(original, contentEn).dual;
}
