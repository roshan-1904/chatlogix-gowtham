import { useEffect, useState } from 'react';
import { tokenStorage } from '@chatlogix/auth';
import { API_URL } from '../../../../lib/api';

// mediaUrl from the backend is always an API-relative path (e.g.
// `/api/messages/<id>/media`), meant to be requested against the same
// origin that serves `/api` - not the frontend's own origin, which may
// differ (e.g. local Vite on :3000 talking to chatlogix.in).
const MEDIA_ORIGIN = API_URL.replace(/\/api\/?$/, '');

const objectUrlCache = new Map<string, string>();
const inFlightRequests = new Map<string, Promise<string>>();

function resolveMediaFetchUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${MEDIA_ORIGIN}${pathOrUrl}`;
}

function isNonMediaBlob(blob: Blob): boolean {
  const type = blob.type.toLowerCase();
  return type.includes('application/json') || type.includes('text/html');
}

async function loadMediaObjectUrl(relativeUrl: string): Promise<string> {
  const cached = objectUrlCache.get(relativeUrl);
  if (cached) return cached;

  const inFlight = inFlightRequests.get(relativeUrl);
  if (inFlight) return inFlight;

  const request = (async () => {
    const token = tokenStorage.getToken();
    const response = await fetch(resolveMediaFetchUrl(relativeUrl), {
      mode: 'cors',
      credentials: 'omit',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!response.ok) {
      throw new Error(`Failed to load media (${response.status})`);
    }
    const blob = await response.blob();
    if (isNonMediaBlob(blob) || blob.size === 0) {
      throw new Error('Media endpoint returned a non-media body');
    }
    const objectUrl = URL.createObjectURL(blob);
    objectUrlCache.set(relativeUrl, objectUrl);
    return objectUrl;
  })();

  inFlightRequests.set(relativeUrl, request);
  try {
    return await request;
  } finally {
    inFlightRequests.delete(relativeUrl);
  }
}

interface UseAuthenticatedMediaResult {
  readonly objectUrl: string | null;
  readonly isLoading: boolean;
  readonly error: boolean;
}

/**
 * Fetches a message-media API path with the vendor's auth token (native
 * media elements can't attach that header themselves) and exposes it as a
 * blob: URL. Results are cached by path for the life of the tab.
 */
export function useAuthenticatedMedia(
  relativeUrl: string | null | undefined,
): UseAuthenticatedMediaResult {
  const cachedUrl = relativeUrl ? objectUrlCache.get(relativeUrl) ?? null : null;
  const [objectUrl, setObjectUrl] = useState<string | null>(cachedUrl);
  const [isLoading, setIsLoading] = useState(Boolean(relativeUrl) && !cachedUrl);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!relativeUrl) {
      setObjectUrl(null);
      setIsLoading(false);
      setError(false);
      return;
    }

    const cached = objectUrlCache.get(relativeUrl);
    if (cached) {
      setObjectUrl(cached);
      setIsLoading(false);
      setError(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(false);

    loadMediaObjectUrl(relativeUrl)
      .then((url) => {
        if (cancelled) return;
        setObjectUrl(url);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (import.meta.env.DEV) {
          console.warn('Failed to load message media', relativeUrl, err);
        }
        setError(true);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [relativeUrl]);

  return { objectUrl, isLoading, error };
}
