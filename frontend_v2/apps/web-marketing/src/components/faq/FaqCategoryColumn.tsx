import type { ComponentType } from 'react';
import type { faq } from '../../copy';

type FaqCategory = (typeof faq.categories)[number];

interface IconProps {
  className?: string;
}

const accentClasses = {
  emerald: { wrap: 'bg-emerald-50 text-[#0f6b5c]', active: 'border-emerald-100 bg-[#e7f6f1]' },
  blue: { wrap: 'bg-blue-50 text-blue-600', active: 'border-blue-100 bg-blue-50' },
  violet: { wrap: 'bg-violet-50 text-violet-600', active: 'border-violet-100 bg-violet-50' },
} as const;

export function FaqCategoryColumn({
  category,
  Icon,
  accent,
  isItemOpen,
  onToggleItem,
}: {
  category: FaqCategory;
  Icon: ComponentType<IconProps>;
  accent: keyof typeof accentClasses;
  isItemOpen: (itemIndex: number) => boolean;
  onToggleItem: (itemIndex: number) => void;
}) {
  const { wrap, active } = accentClasses[accent];

  return (
    <div className="flex h-full min-w-0 flex-col rounded-2xl border border-gray-200 bg-white p-4 sm:p-4.5">
      <div className="flex items-center gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full sm:h-12 sm:w-12 ${wrap}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-[14px] font-bold text-primary-500 sm:text-[15px]">{category.title}</h3>
          <p className="text-[11px] leading-4 text-slate-500 sm:text-[12px]">{category.subtitle}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {category.items.map((item, itemIndex) => {
          const isOpen = isItemOpen(itemIndex);
          const panelId = `faq-${category.id}-panel-${itemIndex}`;
          const buttonId = `faq-${category.id}-button-${itemIndex}`;
          return (
            <div key={item.question}>
              <button
                type="button"
                id={buttonId}
                onClick={() => onToggleItem(itemIndex)}
                className={`flex min-h-[44px] w-full items-center justify-between gap-3 border px-3.5 py-2.5 text-left text-[12px] font-semibold text-primary-500 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 sm:text-[13px] ${
                  isOpen ? `${active} rounded-b-none rounded-t-xl` : 'rounded-xl border-gray-200 bg-white'
                }`}
                aria-expanded={isOpen}
                aria-controls={panelId}
              >
                <span>{item.question}</span>
                <span className="shrink-0 text-base font-normal text-slate-400" aria-hidden>
                  {isOpen ? '−' : '+'}
                </span>
              </button>
              <div
                id={panelId}
                role="region"
                aria-labelledby={buttonId}
                hidden={!isOpen}
                // In document flow, so an open answer pushes the questions below it down
                // instead of drawing on top of them. It used to be `position: absolute`
                // inside an `lg:overflow-hidden` section, which clipped and overlaid.
                className={
                  isOpen
                    ? `rounded-b-xl border border-t-0 px-3.5 pb-3 pt-1 text-[11px] leading-5 text-slate-600 sm:text-[12px] ${active}`
                    : 'hidden'
                }
              >
                {item.answer}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
