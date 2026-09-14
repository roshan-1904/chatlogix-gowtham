import type { EnhanceEntityType, EnhancePreview } from '../../lib/catalogEnhance';

interface Props {
  entityType: EnhanceEntityType;
  preview: EnhancePreview;
  generating: boolean;
  editedText: string;
  onEditedTextChange: (value: string) => void;
}

export function EnhancePreviewPanel({
  entityType,
  preview,
  generating,
  editedText,
  onEditedTextChange,
}: Props) {
  const maxLen = entityType === 'product' ? 2000 : 1500;
  const label = entityType === 'product' ? 'Enhanced description' : 'Enhanced answer';
  const hasPreview = Boolean(
    entityType === 'product' ? preview.description?.trim() : preview.answer?.trim()
  );

  return (
    <div className="relative flex flex-col h-full min-h-0 border border-gray-200 rounded-lg bg-white">
      {generating && (
        <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-10 rounded-lg">
          <span className="text-sm text-gray-600">Generating…</span>
        </div>
      )}
      <div className="p-3 border-b border-gray-100 shrink-0">
        <h3 className="text-sm font-semibold text-gray-900">{label}</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          {editedText.length} / {maxLen} characters — you can edit before saving
        </p>
      </div>
      <div className="flex-1 p-3 min-h-0 flex flex-col gap-3 overflow-y-auto">
        {hasPreview || editedText ? (
          <textarea
            value={editedText}
            onChange={(e) => onEditedTextChange(e.target.value.slice(0, maxLen))}
            maxLength={maxLen}
            rows={8}
            className="w-full flex-1 min-h-[140px] text-sm text-gray-800 border border-gray-300 rounded-lg px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Enhanced text will appear here…"
          />
        ) : (
          <p className="text-sm text-gray-400 italic">
            Preview will appear here once we have enough detail.
          </p>
        )}
        {entityType === 'product' && preview.keywords && preview.keywords.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">Suggested keywords</p>
            <div className="flex flex-wrap gap-1">
              {preview.keywords.map((k) => (
                <span
                  key={k}
                  className="text-xs px-2 py-0.5 rounded-full bg-primary-500/10 text-primary-500"
                >
                  {k}
                </span>
              ))}
            </div>
          </div>
        )}
        {entityType === 'faq' && preview.question && (
          <div className="text-xs text-gray-600">
            <span className="font-medium">Suggested question polish:</span> {preview.question}
          </div>
        )}
      </div>
    </div>
  );
}
