import { useEffect, useRef, useCallback } from 'react';

const AUTO_SAVE_DEBOUNCE_MS = 30000; // 30 seconds

interface UseAutoSaveOptions<T> {
  formData: T;
  storageKey: string;
  onRestore?: (data: T) => void;
  enabled?: boolean;
}

/**
 * Hook for auto-saving form data to localStorage
 * Restores data on mount with user confirmation
 */
export function useAutoSave<T>({
  formData,
  storageKey,
  onRestore,
  enabled = true,
}: UseAutoSaveOptions<T>) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isRestoredRef = useRef(false);

  // Save to localStorage with debounce
  useEffect(() => {
    if (!enabled || !formData) return;

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout
    timeoutRef.current = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(formData));
      } catch (error) {
        console.error('Failed to save form data to localStorage:', error);
      }
    }, AUTO_SAVE_DEBOUNCE_MS);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [formData, storageKey, enabled]);

  // Restore from localStorage on mount
  useEffect(() => {
    if (!enabled || isRestoredRef.current) return;

    try {
      const saved = localStorage.getItem(storageKey);
      if (saved && onRestore) {
        const parsed = JSON.parse(saved) as T;
        // Ask user if they want to restore
        const shouldRestore = window.confirm(
          'We found unsaved changes. Would you like to restore them?'
        );
        if (shouldRestore) {
          onRestore(parsed);
        } else {
          // Clear saved data if user doesn't want to restore
          localStorage.removeItem(storageKey);
        }
      }
      isRestoredRef.current = true;
    } catch (error) {
      console.error('Failed to restore form data from localStorage:', error);
    }
  }, [storageKey, onRestore, enabled]);

  // Clear saved data
  const clearSaved = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      console.error('Failed to clear saved form data:', error);
    }
  }, [storageKey]);

  return { clearSaved };
}

