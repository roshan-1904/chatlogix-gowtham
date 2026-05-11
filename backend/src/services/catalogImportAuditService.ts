import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';

export type JobStatus = 'queued' | 'processing' | 'ready' | 'failed';

export interface CreateJobInput {
  vendorId: string;
  inputManifest: Prisma.InputJsonValue;
  idempotencyKey?: string;
}

export async function createJob(input: CreateJobInput) {
  const job = await prisma.catalogImportJob.create({
    data: {
      vendorId: input.vendorId,
      status: 'queued',
      inputManifest: input.inputManifest,
      idempotencyKey: input.idempotencyKey ?? null
    }
  });
  logger.info({ jobId: job.id, vendorId: input.vendorId }, 'catalog_import_job_created');
  return job;
}

export async function setJobStatus(jobId: string, status: JobStatus, error?: string) {
  await prisma.catalogImportJob.update({
    where: { id: jobId },
    data: { status, error: error ?? null }
  });
}

export async function mergeJobResult(jobId: string, patch: Record<string, unknown>) {
  // Read-modify-write — acceptable for MVP where analyze runs inline in a single
  // process. Phase 2 SSE emits from the same writer, so no concurrent writers.
  const job = await prisma.catalogImportJob.findUnique({
    where: { id: jobId },
    select: { result: true }
  });
  const prev = (job?.result as Record<string, unknown> | null) ?? {};
  const merged = { ...prev, ...patch };
  await prisma.catalogImportJob.update({
    where: { id: jobId },
    data: { result: merged as Prisma.InputJsonValue }
  });
}

export async function recordTokenUsage(jobId: string, usage: Prisma.InputJsonValue) {
  await prisma.catalogImportJob.update({
    where: { id: jobId },
    data: { tokenUsage: usage }
  });
}

export async function findByIdempotencyKey(key: string) {
  return prisma.catalogImportJob.findUnique({ where: { idempotencyKey: key } });
}
