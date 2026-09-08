import type { ReactNode } from 'react';

export function WhatsAppMessage({
  children,
  mine = false,
  small = false,
}: {
  children: ReactNode;
  mine?: boolean;
  small?: boolean;
}) {
  return (
    <div
      className={[
        'w-fit max-w-[88%] rounded-lg shadow-sm',
        small ? 'px-3 py-2 text-xs' : 'px-3 py-2.5 text-sm',
        mine ? 'ml-auto bg-[#d9ffc9]' : 'mr-auto bg-white',
      ].join(' ')}
    >
      {children}
    </div>
  );
}
