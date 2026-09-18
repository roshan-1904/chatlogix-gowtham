import { Link } from 'react-router-dom';
import { DashboardSectionCard } from './DashboardSectionCard';
import { IconChevronRight } from './dashboardIcons';
import type { NeedsAttentionItem } from './buildNeedsAttentionItems';

interface NeedsAttentionPanelProps {
  items: NeedsAttentionItem[];
}

export function NeedsAttentionPanel({ items }: NeedsAttentionPanelProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <DashboardSectionCard title="Needs attention" subtitle="Prioritized actions for your shop">
      <ul className="space-y-2" role="list">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              to={item.href}
              className="flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2.5 transition-colors hover:border-primary-500/15 hover:bg-gray-50"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">{item.title}</p>
                <p className="text-xs text-gray-500">{item.description}</p>
              </div>
              <IconChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
            </Link>
          </li>
        ))}
      </ul>
    </DashboardSectionCard>
  );
}
