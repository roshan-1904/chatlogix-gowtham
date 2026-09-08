import type { ReactNode } from 'react';
import type { problem } from '../../copy';

type ProblemItem = (typeof problem.items)[number];

const toneClasses = {
  rose: {
    wrapper: 'border-rose-100 bg-gradient-to-b from-[#FFF8F8] to-[#FFE8E8]',
    number: 'bg-[#fecaca] text-[#b42318]',
  },
  amber: {
    wrapper: 'border-amber-100 bg-gradient-to-b from-[#FFFDF6] to-[#FEF3C7]/80',
    number: 'bg-[#fed7aa] text-[#9a3412]',
  },
  blue: {
    wrapper: 'border-sky-100 bg-gradient-to-b from-[#F7FBFF] to-[#DBEAFE]',
    number: 'bg-[#bfdbfe] text-[#1d4ed8]',
  },
} as const;

export function ProblemCard({
  item,
  index,
  preview,
}: {
  item: ProblemItem;
  index: number;
  preview: ReactNode;
}) {
  const styles = toneClasses[item.tone];

  return (
    <article className={`relative flex min-w-0 flex-col overflow-hidden rounded-2xl border ${styles.wrapper}`}>
      <div
        className={`absolute left-3 top-3 z-20 flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold sm:left-4 sm:top-4 sm:h-8 sm:w-8 sm:text-[11px] ${styles.number}`}
        aria-hidden
      >
        {String(index + 1).padStart(2, '0')}
      </div>
      <div className="relative z-10 flex items-center justify-center px-2 pb-2 pt-10 sm:px-3 sm:pt-11">
        {preview}
      </div>
      <div className={`relative z-10 px-4 pb-4 pt-1 sm:px-5 sm:pb-5`}>
        <h3 className="text-[15px] font-semibold leading-snug text-[#0b2b52] sm:text-[17px]">{item.title}</h3>
        <p className="mt-1.5 text-[12px] leading-5 text-slate-600 sm:text-[13px]">{item.body}</p>
      </div>
    </article>
  );
}
