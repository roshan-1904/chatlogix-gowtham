interface DateSeparatorProps {
  label: string;
}

export function DateSeparator({ label }: DateSeparatorProps) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-center py-2 -mx-5 px-5 mb-2">
      <div className="flex items-center justify-center px-3 py-1 rounded-full bg-[#e2e6ea] text-[11px] font-medium text-gray-700 shadow-sm">
        {label}
      </div>
    </div>
  );
}


