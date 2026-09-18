import { Link } from 'react-router-dom';

export interface ChecklistItemProps {
  readonly done: boolean;
  readonly title: string;
  readonly hint: string;
  readonly to: string;
  readonly toLabel: string;
}

export function ChecklistItem({ done, title, hint, to, toLabel }: Readonly<ChecklistItemProps>) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
          done ? 'bg-primary-500 text-white' : 'border border-gray-300 text-gray-400'
        }`}
        aria-hidden
      >
        {done ? (
          <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M2.5 6.5 5 9l4.5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </span>
      <div className="flex-1">
        <div className="font-medium text-gray-900">{title}</div>
        <div className="text-xs text-gray-500">{hint}</div>
      </div>
      <Link to={to} className="text-xs font-medium text-primary-500 hover:underline">
        {toLabel}
      </Link>
    </li>
  );
}
