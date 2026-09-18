import { memo } from 'react';
import { DashboardMetricTile, type DashboardMetricTileProps } from './DashboardMetricTile';

export type DashboardStatCardProps = DashboardMetricTileProps;

export const DashboardStatCard = memo(function DashboardStatCard(props: DashboardStatCardProps) {
  return <DashboardMetricTile {...props} />;
});
