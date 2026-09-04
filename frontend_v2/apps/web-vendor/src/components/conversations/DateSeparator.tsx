interface DateSeparatorProps {
  label: string;
}

export function DateSeparator({ label }: DateSeparatorProps) {
  return (
    <div className="sticky top-0 z-10 mb-1 flex items-center justify-center py-1.5">
      <div className="rounded-lg bg-[#e1f2fa] px-3 py-1 text-[12px] font-medium text-[#54656f] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
        {label}
      </div>
    </div>
  );
}
