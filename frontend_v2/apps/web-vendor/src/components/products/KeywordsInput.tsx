/**
 * Keywords input component for AI product matching
 */

import { useState, KeyboardEvent } from 'react';

interface KeywordsInputProps {
  keywords: string[];
  onChange: (keywords: string[]) => void;
  suggestions?: string[];
  maxKeywords?: number;
  maxLength?: number;
  error?: string;
}

export function KeywordsInput({
  keywords,
  onChange,
  suggestions = [],
  maxKeywords = 20,
  maxLength = 50,
  error,
}: KeywordsInputProps) {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      addKeyword(inputValue.trim());
    } else if (e.key === 'Backspace' && !inputValue && keywords.length > 0) {
      // Remove last keyword if backspace pressed on empty input
      removeKeyword(keywords.length - 1);
    }
  };

  const addKeyword = (keyword: string) => {
    if (keywords.length >= maxKeywords) {
      return;
    }

    const trimmed = keyword.trim().toLowerCase();
    if (!trimmed || trimmed.length > maxLength) {
      return;
    }

    // Check for duplicates (case-insensitive)
    if (keywords.some(k => k.toLowerCase() === trimmed)) {
      setInputValue('');
      return;
    }

    onChange([...keywords, trimmed]);
    setInputValue('');
  };

  const removeKeyword = (index: number) => {
    onChange(keywords.filter((_, i) => i !== index));
  };

  const handleSuggestionClick = (suggestion: string) => {
    addKeyword(suggestion);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 p-2 border border-gray-300 rounded-lg min-h-[42px] bg-white">
        {keywords.map((keyword, index) => (
          <span
            key={index}
            className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-primary-500 rounded-md text-sm"
          >
            {keyword}
            <button
              type="button"
              onClick={() => removeKeyword(index)}
              className="text-primary-500 hover:opacity-80 focus:outline-none"
              aria-label={`Remove keyword ${keyword}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={keywords.length === 0 ? 'Add keywords...' : ''}
          className="flex-1 min-w-[120px] border-0 outline-0 text-sm"
          maxLength={maxLength}
          disabled={keywords.length >= maxKeywords}
        />
      </div>
      
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
      
      {keywords.length >= maxKeywords && (
        <p className="text-xs text-gray-500">Maximum {maxKeywords} keywords reached</p>
      )}
      
      {suggestions.length > 0 && inputValue && (
        <div className="border border-gray-200 rounded-lg bg-white shadow-lg max-h-40 overflow-y-auto">
          {suggestions
            .filter(s => s.toLowerCase().includes(inputValue.toLowerCase()) && !keywords.includes(s.toLowerCase()))
            .slice(0, 5)
            .map((suggestion, index) => (
              <button
                key={index}
                type="button"
                onClick={() => handleSuggestionClick(suggestion)}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
              >
                {suggestion}
              </button>
            ))}
        </div>
      )}
      
      <p className="text-xs text-gray-500">
        Press Enter to add. Maximum {maxKeywords} keywords, each up to {maxLength} characters.
      </p>
    </div>
  );
}

