import { Card } from '@chatlogix/ui';

function PulseBar() {
  return (
    <Card className="rounded-xl p-4">
      <div className="animate-pulse space-y-2">
        <div className="h-3 w-20 rounded bg-gray-200" />
        <div className="h-7 w-24 rounded bg-gray-200" />
        <div className="h-3 w-32 rounded bg-gray-100" />
      </div>
    </Card>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-4 animate-pulse motion-reduce:animate-none">
      <div className="h-16 rounded-xl bg-gray-100" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <PulseBar key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <div className="h-40 rounded-xl bg-gray-100" />
          <div className="h-48 rounded-xl bg-gray-100" />
          <div className="h-48 rounded-xl bg-gray-100" />
        </div>
        <div className="space-y-4 lg:col-span-4">
          <div className="h-36 rounded-xl bg-gray-100" />
          <div className="h-44 rounded-xl bg-gray-100" />
        </div>
      </div>
    </div>
  );
}

export function DashboardCardSkeleton() {
  return <PulseBar />;
}
