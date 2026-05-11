interface InsightBadgeProps {
  label: string;
  kind:
    | 'new-customer'
    | 'regular-customer'
    | 'returning-customer'
    | 'placed-order'
    | 'order-ready'
    | 'order-delivered'
    | 'order-inquiry'
    | 'no-order-yet'
    | 'active-now'
    | 'recently-active'
    | 'waiting-response'
    | 'needs-follow-up'
    | 'inactive'
    | 'high-value'
    | 'bulk-order'
    | 'inquiring'
    | 'price-inquiry'
    | 'custom-request'
    | 'ai-paused'
    | 'payment-pending'
    | 'urgent-delivery'
    | 'special-occasion';
}

function getBadgeClasses(kind: InsightBadgeProps['kind']): string {
  switch (kind) {
    case 'new-customer':
    case 'recently-active':
    case 'inquiring':
      return 'bg-blue-100 text-blue-800';
    case 'regular-customer':
    case 'no-order-yet':
    case 'inactive':
      return 'bg-gray-100 text-gray-700';
    case 'returning-customer':
    case 'custom-request':
      return 'bg-teal-100 text-teal-800';
    case 'placed-order':
    case 'active-now':
      return 'bg-green-100 text-green-800';
    case 'order-delivered':
      return 'bg-green-200 text-green-900';
    case 'order-ready':
    case 'needs-follow-up':
    case 'payment-pending':
      return 'bg-orange-100 text-orange-800';
    case 'order-inquiry':
    case 'waiting-response':
    case 'price-inquiry':
      return 'bg-yellow-100 text-yellow-800';
    case 'high-value':
      return 'bg-amber-100 text-amber-800';
    case 'bulk-order':
      return 'bg-purple-100 text-purple-800';
    case 'ai-paused':
    case 'urgent-delivery':
      return 'bg-red-100 text-red-800';
    case 'special-occasion':
      return 'bg-pink-100 text-pink-800';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

export function InsightBadge({ label, kind }: InsightBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${getBadgeClasses(
        kind,
      )}`}
      aria-label={label}
    >
      {label}
    </span>
  );
}


