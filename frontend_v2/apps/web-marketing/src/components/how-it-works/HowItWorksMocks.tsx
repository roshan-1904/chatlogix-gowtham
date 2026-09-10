import type { ReactNode } from 'react';
import { howItWorks } from '../../copy';
import { WaChatHeaderActions } from '../hero/whatsapp/WhatsAppPhoneShell';

const cardClass =
  'flex h-full min-h-[10.5rem] flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-[0_3px_10px_rgba(7,35,73,0.05)]';

function MiniBubble({ children, mine = false }: { children: ReactNode; mine?: boolean }) {
  return (
    <div
      className={`w-fit max-w-[92%] rounded-md px-2 py-1.5 text-[11px] leading-snug shadow-sm ${
        mine ? 'ml-auto bg-[#d9ffc9]' : 'mr-auto bg-white'
      }`}
    >
      {children}
    </div>
  );
}

function ProductRow({
  name,
  price,
  swatch,
}: {
  name: string;
  price: string;
  swatch: string;
}) {
  return (
    <div className="flex flex-1 items-center gap-2 px-2 py-1">
      <span className="h-5 w-5 shrink-0 rounded-sm border border-black/5" style={{ backgroundColor: swatch }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-medium leading-tight text-primary-500">{name}</p>
        <p className="text-[10px] leading-tight text-slate-500">{price}</p>
      </div>
      <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-[#0f6b5c]">
        {howItWorks.catalogCard.badge}
      </span>
    </div>
  );
}

export function CatalogExtractMock() {
  const { catalogCard } = howItWorks;
  return (
    <div className={cardClass}>
      <p className="border-b border-gray-100 px-2 py-1.5 text-[11px] font-semibold text-primary-500">{catalogCard.title}</p>
      <div className="flex flex-1 flex-col divide-y divide-gray-50">
        {catalogCard.products.map((item) => (
          <ProductRow key={item.name} {...item} />
        ))}
      </div>
    </div>
  );
}

export function WhatsAppStartMock() {
  const { chatCard } = howItWorks;
  return (
    <div className={cardClass}>
      <div className="flex items-center gap-2 bg-[#008069] px-2 py-1.5 text-white">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px] font-semibold">
          R
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold leading-tight">{chatCard.name}</p>
          <p className="text-[10px] leading-tight text-white/80">{chatCard.subtitle}</p>
        </div>
        <WaChatHeaderActions size="sm" />
      </div>
      <div className="flex flex-1 flex-col justify-between gap-1.5 bg-[#e5ddd5] p-2">
        <div className="flex flex-col gap-1.5">
          <MiniBubble>{chatCard.customer}</MiniBubble>
          <MiniBubble mine>
            <span className="line-clamp-3">{chatCard.shop}</span>
          </MiniBubble>
        </div>
        <div className="flex h-6 items-center rounded-full bg-white px-2">
          <span className="h-1.5 w-full rounded-full bg-gray-200" />
        </div>
      </div>
    </div>
  );
}

export function LiveInboxMock() {
  const { inboxCard } = howItWorks;
  const chats = inboxCard.chats.slice(0, 3);
  return (
    <div className={cardClass}>
      <p className="border-b border-gray-100 px-2 py-1.5 text-[11px] font-semibold text-primary-500">{inboxCard.title}</p>
      <div className="flex flex-1 flex-col divide-y divide-[#e9edef]">
        {chats.map((chat) => (
          <div key={chat.name} className="flex flex-1 items-center gap-2 px-2 py-1">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#dfe5e7] text-[10px] font-medium text-[#54656f]">
              {chat.name.slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-1">
                <p className="truncate text-[11px] font-medium text-[#111b21]">{chat.name}</p>
                <span className="shrink-0 text-[10px] font-medium text-[#25D366]">{chat.time}</span>
              </div>
              <p className="truncate text-[10px] text-[#667781]">{chat.preview}</p>
            </div>
            <span className="flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full bg-[#25D366] px-1 text-[10px] font-semibold text-white">
              {chat.unread}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const statusTone: Record<string, string> = {
  Confirmed: 'bg-sky-50 text-sky-700',
  Packing: 'bg-amber-50 text-amber-700',
  Shipped: 'bg-violet-50 text-violet-700',
  Delivered: 'bg-emerald-50 text-emerald-700',
};

export function OrdersDashboardMock() {
  const { dashboardCard } = howItWorks;
  const rows = dashboardCard.rows.slice(0, 3);
  return (
    <div className={`${cardClass} !flex-row`}>
      {/* 34% keeps "Conversations" readable in the narrowest four-column step card (1280). */}
      <div className="flex w-[34%] shrink-0 flex-col gap-1.5 self-stretch bg-[#0b2b52] px-1.5 py-2">
        {dashboardCard.nav.map((item) => (
          <p
            key={item}
            className={`truncate rounded px-1.5 py-1 text-[10px] leading-tight ${
              item === dashboardCard.active ? 'bg-white/15 font-semibold text-white' : 'text-white/70'
            }`}
          >
            {item}
          </p>
        ))}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <p className="border-b border-gray-100 px-2 py-1.5 text-[11px] font-semibold text-primary-500">{dashboardCard.heading}</p>
        {rows.map((row) => (
          <div key={row.id} className="flex flex-1 items-center gap-1.5 border-b border-gray-50 px-2 py-1 last:border-0">
            <span className="h-4 w-4 shrink-0 rounded-sm bg-[#dfe5e7]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-medium text-primary-500">{row.id}</p>
              <p className="truncate text-[10px] text-slate-500">{row.amount}</p>
            </div>
            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${statusTone[row.status] ?? 'bg-gray-50 text-gray-600'}`}>
              {row.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HowItWorksStepPreview({ id }: { id: (typeof howItWorks.steps)[number]['id'] }) {
  const preview = (() => {
    switch (id) {
      case 'catalog':
        return <CatalogExtractMock />;
      case 'chatting':
        return <WhatsAppStartMock />;
      case 'ai':
        return <LiveInboxMock />;
      case 'control':
        return <OrdersDashboardMock />;
      default:
        return null;
    }
  })();

  return <div className="flex h-full min-h-0 flex-1 flex-col">{preview}</div>;
}
