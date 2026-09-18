import { Card } from '@chatlogix/ui';

export function WhatsAppConnectSkeleton() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse space-y-6 p-1 motion-reduce:animate-none sm:p-2">
      <div className="h-10 w-2/3 rounded bg-gray-200" />
      <div className="h-12 rounded-xl bg-gray-100" />
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="h-64 rounded-xl lg:col-span-3"><span className="sr-only">Loading</span></Card>
        <Card className="hidden h-64 rounded-xl lg:col-span-2 lg:block"><span className="sr-only">Loading</span></Card>
      </div>
    </div>
  );
}
