import { memo } from 'react';
import { Card } from '@chatlogix/ui';

interface DashboardStatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral' | null;
  onClick?: () => void;
}

export const DashboardStatCard = memo(function DashboardStatCard({
  label,
  value,
  subValue,
  trend,
  onClick
}: DashboardStatCardProps) {
  const cardContent = (
    <div
      className={`${onClick ? 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#072349] focus:ring-offset-2 rounded-lg' : ''} flex flex-col`}
      onClick={onClick}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      } : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `${label}: ${value}${subValue ? `. ${subValue}` : ''}. Click to view details` : undefined}
    >
      <h3 className="text-[9px] sm:text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2 sm:mb-3">{label}</h3>
      <p className="text-2xl sm:text-3xl font-bold text-[#072349] mb-2 sm:mb-3 leading-tight" aria-label={`${label} value is ${value}`}>{value}</p>
      <div className="flex-1 flex flex-col justify-end">
        {subValue && (
          <div className="space-y-0.5 sm:space-y-1 mb-1 sm:mb-2">
            {subValue.split(' • ').map((item, index) => (
              <p key={index} className="text-[10px] sm:text-xs text-gray-500 leading-relaxed">{item}</p>
            ))}
          </div>
        )}
        {trend && trend !== 'neutral' && (
          <div 
            className={`flex items-center mt-1 sm:mt-2 text-[10px] sm:text-xs font-semibold ${
              trend === 'up' ? 'text-[#25D366]' : 'text-red-500'
            }`}
            aria-label={`Trend is ${trend === 'up' ? 'up' : 'down'} compared to yesterday`}
          >
            <span className="mr-1 sm:mr-1.5 text-xs sm:text-sm" aria-hidden="true">{trend === 'up' ? '↑' : '↓'}</span>
            <span>vs yesterday</span>
          </div>
        )}
        {!subValue && !trend && <div className="h-4 sm:h-6"></div>}
      </div>
    </div>
  );

  return (
    <Card className={`${onClick ? 'hover:shadow-xl hover:border-[#072349]/30 hover:-translate-y-0.5 transition-all duration-300' : ''} p-3 sm:p-4 lg:p-5 bg-gradient-to-br from-white to-gray-50/50 border-[#072349]/10 flex flex-col min-h-[120px] sm:min-h-[140px]`}>
      {cardContent}
    </Card>
  );
});


