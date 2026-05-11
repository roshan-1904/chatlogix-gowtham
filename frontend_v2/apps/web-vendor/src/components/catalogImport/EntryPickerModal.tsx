import { useNavigate } from 'react-router-dom';
import { Modal } from '@chatlogix/ui';

interface Props {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly templateAvailable: boolean;
  readonly categoryLabel?: string | null;
}

export function EntryPickerModal({
  isOpen,
  onClose,
  templateAvailable,
  categoryLabel
}: Readonly<Props>) {
  const navigate = useNavigate();

  const go = (path: string) => {
    onClose();
    void navigate(path);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add products with AI">
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          Pick how you&apos;d like to start. You can mix entries later.
        </p>

        <Option
          title="Upload brochure / price list"
          hint="Photos of a menu or catalog + optional CSV/Excel. Good for 10-200 products."
          onClick={() => go('/catalog/import')}
        />
        <Option
          title="One-photo add"
          hint="Snap a single product. AI fills the details; you set the price."
          onClick={() => go('/catalog/import/photo')}
        />
        {templateAvailable ? (
          <Option
            title={`Start from a ${categoryLabel ?? 'category'} template`}
            hint="Pick from a curated starter list and fill in prices."
            onClick={() => go('/catalog/import/template')}
          />
        ) : (
          <div className="rounded-lg border border-dashed border-gray-200 px-4 py-3 text-xs text-gray-500">
            Starter templates are coming for your category. Use brochure or
            one-photo for now.
          </div>
        )}
      </div>
    </Modal>
  );
}

interface OptionProps {
  readonly title: string;
  readonly hint: string;
  readonly onClick: () => void;
}

function Option({ title, hint, onClick }: Readonly<OptionProps>) {
  return (
    <button
      type="button"
      className="w-full rounded-lg border border-gray-200 px-4 py-3 text-left transition hover:border-primary-500 hover:bg-primary-500/5"
      onClick={onClick}
    >
      <div className="text-sm font-medium text-gray-800">{title}</div>
      <div className="mt-0.5 text-xs text-gray-500">{hint}</div>
    </button>
  );
}
