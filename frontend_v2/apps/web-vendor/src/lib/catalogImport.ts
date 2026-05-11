import { apiClient } from './api';
import { tokenStorage } from '@chatlogix/auth';
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  CatalogImportJob,
  CommitRequest,
  CommitSummary,
  FastPhotoResult,
  JobListEntry,
  NormalizedProductDraft,
  SandboxTestResult,
  SseEventType,
  SseHandlers,
  UploadUrlResponse
} from '../types/catalogImport';

const API_URL = import.meta.env.VITE_API_URL || 'https://chatlogix.in/api';

// -- Upload helpers ---------------------------------------------------------

function compact(text: string, max = 260): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}...`;
}

function getResponseSnippet(xhr: XMLHttpRequest): string | null {
  const body = xhr.responseText?.trim();
  if (!body) return null;
  return compact(body, 320);
}

function buildS3UploadError(xhr: XMLHttpRequest): Error {
  const status = xhr.status || 0;
  const statusText = xhr.statusText || 'unknown';
  const requestId = xhr.getResponseHeader('x-amz-request-id') || 'n/a';
  const extendedRequestId = xhr.getResponseHeader('x-amz-id-2') || 'n/a';
  const bodySnippet = getResponseSnippet(xhr);

  const message = [
    `S3 upload failed (${status} ${statusText}).`,
    bodySnippet ? `Response: ${bodySnippet}` : 'No response body available.',
    `x-amz-request-id=${requestId}, x-amz-id-2=${extendedRequestId}`
  ].join(' ');

  return new Error(message);
}

export async function requestUploadUrl(params: {
  filename: string;
  contentType: string;
  sizeBytes: number;
  jobId?: string;
}): Promise<UploadUrlResponse> {
  return apiClient.post<UploadUrlResponse>('/catalog-import/upload-url', params);
}

export function uploadToS3(
  presignedUrl: string,
  file: File,
  onProgress?: (loaded: number, total: number) => void
): Promise<void> {
  // fetch doesn't expose upload progress — XHR is still the only browser API
  // that lets us drive a progress bar per-file.
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', presignedUrl);
    xhr.setRequestHeader('Content-Type', file.type);
    if (onProgress) {
      xhr.upload.addEventListener('progress', (evt) => {
        if (evt.lengthComputable) onProgress(evt.loaded, evt.total);
      });
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : (() => {
            const error = buildS3UploadError(xhr);
            console.error('catalog_import_s3_upload_failed', {
              status: xhr.status,
              statusText: xhr.statusText,
              responseSnippet: getResponseSnippet(xhr),
              requestId: xhr.getResponseHeader('x-amz-request-id'),
              extendedRequestId: xhr.getResponseHeader('x-amz-id-2')
            });
            reject(error);
          })();
    xhr.onerror = () =>
      reject(
        new Error(
          'S3 upload network error. Check browser Network tab for CORS, blocked request, or connectivity issues.'
        )
      );
    xhr.send(file);
  });
}

// -- Analyze / commit / job-fetch ------------------------------------------

export async function analyze(payload: AnalyzeRequest): Promise<AnalyzeResponse> {
  return apiClient.post<AnalyzeResponse>('/catalog-import/analyze', payload);
}

export async function getJob(jobId: string): Promise<CatalogImportJob> {
  return apiClient.get<CatalogImportJob>(`/catalog-import/${jobId}`);
}

export async function patchDraft(
  jobId: string,
  draftEdits: NormalizedProductDraft[]
): Promise<{ ok: true }> {
  return apiClient.request<{ ok: true }>(`/catalog-import/${jobId}/draft`, {
    method: 'PATCH',
    body: JSON.stringify({ draftEdits })
  });
}

export async function commit(payload: CommitRequest): Promise<CommitSummary> {
  return apiClient.post<CommitSummary>('/catalog-import/commit', payload);
}

export async function commitWave2(
  jobId: string,
  payload: Omit<CommitRequest, 'jobId' | 'wave'>
): Promise<CommitSummary> {
  return apiClient.post<CommitSummary>(`/catalog-import/${jobId}/commit-wave2`, payload);
}

export async function retryFailed(jobId: string): Promise<CommitSummary> {
  return apiClient.post<CommitSummary>(`/catalog-import/${jobId}/retry-failed`, {});
}

export async function listJobs(status?: 'has_deferred'): Promise<{ jobs: JobListEntry[] }> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiClient.get<{ jobs: JobListEntry[] }>(`/catalog-import/jobs${qs}`);
}

export async function fastPhoto(imageKey: string): Promise<FastPhotoResult> {
  return apiClient.post<FastPhotoResult>('/catalog-import/fast/photo', { imageKey });
}

export async function fastTemplate(
  category: string
): Promise<{ category: string; products: NormalizedProductDraft[] }> {
  return apiClient.post<{ category: string; products: NormalizedProductDraft[] }>(
    '/catalog-import/fast/template',
    { category }
  );
}

export async function isTemplateAvailable(category: string): Promise<boolean> {
  const res = await apiClient.get<{ category: string; available: boolean }>(
    `/catalog-import/template/${encodeURIComponent(category)}/available`
  );
  return res.available;
}

export async function testMessage(text: string, jobId?: string): Promise<SandboxTestResult> {
  return apiClient.post<SandboxTestResult>('/catalog-import/test-message', { text, jobId });
}

// -- SSE stream -------------------------------------------------------------

/**
 * Subscribe to the extraction SSE stream for a job. Reconnects with
 * Last-Event-ID on transient errors; falls back to polling after 3 consecutive
 * failures. Returns a cleanup function that closes the stream.
 */
export function streamJob(jobId: string, handlers: SseHandlers): () => void {
  let closed = false;
  let errorStreak = 0;
  let source: EventSource | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const url = `${API_URL}/catalog-import/${jobId}/stream`;
  const token = tokenStorage.getToken();

  const startPolling = () => {
    if (pollTimer || closed) return;
    pollTimer = setInterval(async () => {
      if (closed) return;
      try {
        const job = await getJob(jobId);
        if (job.status === 'ready') {
          handlers.onTerminal?.('job.complete', { replayed: true });
          cleanup();
        } else if (job.status === 'failed') {
          handlers.onTerminal?.('job.failed', { reason: job.error ?? 'unknown' });
          cleanup();
        }
      } catch (err) {
        handlers.onError?.(err as Error);
      }
    }, 2000);
  };

  const cleanup = () => {
    closed = true;
    source?.close();
    source = null;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };

  const connect = () => {
    if (closed) return;
    // EventSource can't set headers directly; pass token via query string.
    // Backend accepts either `?token=` or `Authorization` — easier for SSE.
    // Note: native EventSource auto-sends `Last-Event-ID` on reconnect; the
    // backend reads it from the header, so we don't append it here.
    const sep = url.includes('?') ? '&' : '?';
    const authQ = token ? `${sep}token=${encodeURIComponent(token)}` : '';
    source = new EventSource(`${url}${authQ}`, { withCredentials: true });

    const handle = (type: SseEventType) => (evt: MessageEvent) => {
      errorStreak = 0;
      try {
        const data = JSON.parse(evt.data);
        handlers.onEvent?.(type, data);
        if (type === 'job.complete' || type === 'job.failed') {
          handlers.onTerminal?.(type, data);
          cleanup();
        }
      } catch (err) {
        handlers.onError?.(err as Error);
      }
    };

    source.addEventListener('page.started', handle('page.started'));
    source.addEventListener('page.completed', handle('page.completed'));
    source.addEventListener('page.failed', handle('page.failed'));
    source.addEventListener('tabular.parsed', handle('tabular.parsed'));
    source.addEventListener('enrichment.done', handle('enrichment.done'));
    source.addEventListener('job.snapshot', handle('job.snapshot'));
    source.addEventListener('job.complete', handle('job.complete'));
    source.addEventListener('job.failed', handle('job.failed'));

    source.onerror = () => {
      if (closed) return;
      errorStreak += 1;
      source?.close();
      source = null;
      if (errorStreak >= 3) {
        startPolling();
      } else {
        // Backoff reconnect: 1s, 2s, 4s.
        setTimeout(connect, 1000 * Math.pow(2, errorStreak - 1));
      }
    };
  };

  connect();
  return cleanup;
}
