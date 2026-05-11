import type { Response } from 'express';
import { logger } from '../logger.js';

export type SseEventType =
  | 'page.started'
  | 'page.completed'
  | 'page.failed'
  | 'tabular.parsed'
  | 'enrichment.done'
  | 'job.snapshot'
  | 'job.complete'
  | 'job.failed';

export interface SseEvent {
  id: number;
  type: SseEventType;
  data: Record<string, unknown>;
}

interface JobState {
  clients: Set<Response>;
  buffer: SseEvent[];
  nextId: number;
}

/**
 * In-memory pub/sub for catalog-import SSE. Analyze runs inline in the API
 * process in Phase 2, so a single-process bus is sufficient. If we ever move
 * analyze to a worker this needs to become Redis pub/sub — the emit/subscribe
 * API here is shaped to make that swap easy.
 */
class CatalogImportEventBus {
  private jobs = new Map<string, JobState>();
  // Cap per-job buffer so a disconnected client can't leak memory forever.
  private static readonly MAX_BUFFER = 200;

  emit(jobId: string, type: SseEventType, data: Record<string, unknown>): void {
    const state = this.getOrCreate(jobId);
    const event: SseEvent = { id: state.nextId++, type, data };
    state.buffer.push(event);
    if (state.buffer.length > CatalogImportEventBus.MAX_BUFFER) {
      state.buffer.splice(0, state.buffer.length - CatalogImportEventBus.MAX_BUFFER);
    }
    for (const client of state.clients) {
      try {
        client.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
      } catch (err) {
        logger.warn({ err, jobId }, 'sse_write_failed');
      }
    }
    if (type === 'job.complete' || type === 'job.failed') {
      // Let clients receive the terminal event, then drop state after a grace period.
      setTimeout(() => this.cleanup(jobId), 5000);
    }
  }

  subscribe(jobId: string, client: Response, lastEventId?: number): () => void {
    const state = this.getOrCreate(jobId);
    state.clients.add(client);
    if (typeof lastEventId === 'number') {
      for (const evt of state.buffer) {
        if (evt.id > lastEventId) {
          client.write(`id: ${evt.id}\nevent: ${evt.type}\ndata: ${JSON.stringify(evt.data)}\n\n`);
        }
      }
    }
    return () => {
      state.clients.delete(client);
    };
  }

  snapshot(jobId: string): SseEvent[] {
    return this.jobs.get(jobId)?.buffer ?? [];
  }

  private getOrCreate(jobId: string): JobState {
    let state = this.jobs.get(jobId);
    if (!state) {
      state = { clients: new Set(), buffer: [], nextId: 1 };
      this.jobs.set(jobId, state);
    }
    return state;
  }

  private cleanup(jobId: string): void {
    const state = this.jobs.get(jobId);
    if (!state) return;
    if (state.clients.size > 0) return; // still have listeners; try again later
    this.jobs.delete(jobId);
  }
}

export const catalogImportEventBus = new CatalogImportEventBus();
