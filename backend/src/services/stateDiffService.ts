import { CustomerUpdateEvent, OrderUpdateEvent, OrderItem } from '../types/aiResponse.js';
import { parseEstimatedDelivery } from '../utils/dateParser.js';
import { ConversationState } from '../types/conversationState.js';

type StateSnapshot = ConversationState['state'];

function isNonEmptyString(value?: string): boolean {
  return !!value && value.trim().length > 0;
}

export function computeCustomerUpdateEvent(prevState: StateSnapshot, nextState: StateSnapshot): CustomerUpdateEvent | undefined {
  const updates: CustomerUpdateEvent['updates'] = {};
  const prev = prevState.customer;
  const next = nextState.customer;

  if (isNonEmptyString(next.basicDetails) && next.basicDetails !== (prev.basicDetails || '')) updates.basicDetails = next.basicDetails;
  if (isNonEmptyString(next.preferences) && next.preferences !== (prev.preferences || '')) updates.preferences = next.preferences;
  if (isNonEmptyString(next.communicationStyle) && next.communicationStyle !== (prev.communicationStyle || '')) updates.communicationStyle = next.communicationStyle;
  if (isNonEmptyString(next.deliveryAddress) && next.deliveryAddress !== (prev.deliveryAddress || '')) updates.deliveryAddress = next.deliveryAddress;
  if (isNonEmptyString(next.deliveryInstructions) && next.deliveryInstructions !== (prev.deliveryInstructions || '')) updates.deliveryInstructions = next.deliveryInstructions;
  if (isNonEmptyString(next.specialRequests) && next.specialRequests !== (prev.specialRequests || '')) updates.specialRequests = next.specialRequests;

  const keys = Object.keys(updates);
  if (keys.length === 0) return undefined;

  return {
    shouldUpdate: true,
    updates
  };
}

function normalizeItems(items: any[]): OrderItem[] {
  return (items || []).map((it: any) => ({
    product: String(it.product || ''),
    quantity: Number(it.quantity) || 0,
    unitPrice: Number(it.unitPrice) || 0,
    totalPrice: Number(it.totalPrice) || 0,
    unit: it.unit
  }));
}

export function computeOrderUpdateEvent(prevState: StateSnapshot, nextState: StateSnapshot): OrderUpdateEvent | undefined {
  const prev = prevState.order;
  const next = nextState.order;

  const itemsChanged = JSON.stringify(normalizeItems(prev.items || [])) !== JSON.stringify(normalizeItems(next.items || []));
  const addrChanged = (next.deliveryAddress || '') !== (prev.deliveryAddress || '');
  const instrChanged = (next.deliveryInstructions || '') !== (prev.deliveryInstructions || '');
  const reqsChanged = (next.specialRequests || '') !== (prev.specialRequests || '');
  const dateChanged = (next.deliveryDate || '') !== (prev.deliveryDate || '');
  const timeChanged = (next.deliveryTime || '') !== (prev.deliveryTime || '');

  const anyChanged = itemsChanged || addrChanged || instrChanged || reqsChanged || dateChanged || timeChanged;
  if (!anyChanged) return undefined;

  // Decide action: prioritize confirm if status moved to confirmed; else create/update
  let action: OrderUpdateEvent['action'] = 'update';
  if (next.status === 'confirmed') action = 'confirm';
  else if (!prev.items?.length && next.items?.length) action = 'create';

  const event: OrderUpdateEvent = {
    action,
    items: normalizeItems(next.items || []),
    deliveryAddress: next.deliveryAddress || undefined,
    deliveryInstructions: next.deliveryInstructions || undefined,
    specialRequests: next.specialRequests || undefined,
    customerNotes: next.notes || undefined,
    estimatedDelivery: undefined
  };

  const est = parseEstimatedDelivery(next.deliveryDate, next.deliveryTime);
  if (est) {
    event.estimatedDelivery = est.toISOString();
  }

  return event;
}


