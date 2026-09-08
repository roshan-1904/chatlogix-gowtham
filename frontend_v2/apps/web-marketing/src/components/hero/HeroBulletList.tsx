import { hero } from '../../copy';
import { FeatureBulletList } from '../FeatureBulletList';
import { CartOrderIcon, ClockGrowIcon, LightningIcon } from './HeroIcons';

const iconById = {
  instant: { Icon: LightningIcon, wrap: 'bg-[#25D366]/12 text-[#128C7E]' },
  orders: { Icon: CartOrderIcon, wrap: 'bg-[#3b82f6]/12 text-[#2563eb]' },
  time: { Icon: ClockGrowIcon, wrap: 'bg-[#8b5cf6]/12 text-[#7c3aed]' },
} as const;

export function HeroBulletList({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? 'mt-3 max-lg:mt-2.5 sm:mt-4' : 'mt-6'}>
      <FeatureBulletList items={hero.bullets} iconById={iconById} compact={compact} />
    </div>
  );
}
