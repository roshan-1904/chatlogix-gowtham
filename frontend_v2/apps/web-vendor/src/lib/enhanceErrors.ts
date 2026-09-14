/** ApiClient throws plain Error; 402 body is `{ error: 'insufficient_balance' }`. */
export function isEnhanceInsufficientBalance(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes('insufficient_balance') || msg.includes('api error: 402');
}
