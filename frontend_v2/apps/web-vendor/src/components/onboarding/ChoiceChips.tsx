interface ChoiceChipsProps<T extends string> {
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  ariaLabel: string;
}

export function ChoiceChips<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: ChoiceChipsProps<T>) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => {
        const selected = option === value;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
              selected
                ? 'border-primary-500 bg-primary-50 text-primary-800'
                : 'border-gray-200 bg-white text-gray-700 hover:border-primary-200'
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
