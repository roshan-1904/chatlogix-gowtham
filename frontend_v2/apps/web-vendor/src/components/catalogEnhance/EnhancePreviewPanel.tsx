import type { EnhanceEntityType, EnhancePreview } from '../../lib/catalogEnhance';

interface Props {
  entityType: EnhanceEntityType;
  preview: EnhancePreview;
  generating: boolean;
}

export function EnhancePreviewPanel({ entityType, preview, generating }: Props) {
  const text =
    entityType === 'product' ? preview.description ?? '' : preview.answer ?? '';
  const maxLen = entityType === 'product' ? 2000 : 1500;
  const label = entityType === 'product' ? 'Enhanced description' : 'Enhanced answer';

  return (
    <div className="relative flex flex-col h-full min-h-0 border border-gray-200 rounded-lg bg-white">
      {generating && (
        <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-10 rounded-lg">
          <span className="text-sm text-gray-600">Generating…</span>
        </div>
      )}
      <div className="p-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">{label}</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          {text.length} / {maxLen} characters
        </p>
      </div>
      <div className="flex-1 p-3 overflow-y-auto">
        {text ? (
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{text}</p>
        ) : (
          <p className="text-sm text-gray-400 italic">
            Preview will appear here once we have enough detail.
          </p>
        )}
        {entityType === 'product' && preview.keywords && preview.keywords.length > 0 && (
          <div className="mt-4">
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
          <div className="mt-4 text-xs text-gray-600">
            <span className="font-medium">Suggested question polish:</span> {preview.question}
          </div>
        )}
      </div>
    </div>
  );
}
