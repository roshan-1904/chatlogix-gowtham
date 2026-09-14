import { randomUUID } from 'node:crypto';
import { getRedisClient } from '../utils/redis.js';

const SESSION_TTL_SEC = 24 * 60 * 60;

export type EnhanceEntityType = 'product' | 'faq';

export interface EnhanceChatMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface EnhancePreview {
  description?: string;
  answer?: string;
  question?: string;
  keywords?: string[];
}

export interface EnhanceSession {
  id: string;
  vendorId: string;
  entityType: EnhanceEntityType;
  entityId: string;
  messages: EnhanceChatMessage[];
  preview: EnhancePreview;
  createdAt: string;
  expiresAt: string;
}

function sessionKey(id: string): string {
  return `enhance:session:${id}`;
}

function indexKey(vendorId: string, entityType: EnhanceEntityType, entityId: string): string {
  return `enhance:idx:${vendorId}:${entityType}:${entityId}`;
}

export class EnhanceSessionUnavailableError extends Error {
  constructor() {
    super('Enhancement sessions require Redis');
    this.name = 'EnhanceSessionUnavailableError';
  }
}

function requireRedis() {
  const redis = getRedisClient();
  if (!redis) throw new EnhanceSessionUnavailableError();
  return redis;
}

export async function getSession(sessionId: string): Promise<EnhanceSession | null> {
  const redis = requireRedis();
  const raw = await redis.get(sessionKey(sessionId));
  if (!raw) return null;
  return JSON.parse(raw) as EnhanceSession;
}

export async function saveSession(session: EnhanceSession): Promise<void> {
  const redis = requireRedis();
  const now = Date.now();
  session.expiresAt = new Date(now + SESSION_TTL_SEC * 1000).toISOString();
  const payload = JSON.stringify(session);
  await redis.set(sessionKey(session.id), payload, 'EX', SESSION_TTL_SEC);
  await redis.set(indexKey(session.vendorId, session.entityType, session.entityId), session.id, 'EX', SESSION_TTL_SEC);
}

export async function deleteSession(session: EnhanceSession): Promise<void> {
  const redis = requireRedis();
  await redis.del(sessionKey(session.id));
  await redis.del(indexKey(session.vendorId, session.entityType, session.entityId));
}

export async function findSessionForEntity(
  vendorId: string,
  entityType: EnhanceEntityType,
  entityId: string
): Promise<EnhanceSession | null> {
  const redis = requireRedis();
  const sessionId = await redis.get(indexKey(vendorId, entityType, entityId));
  if (!sessionId) return null;
  return getSession(sessionId);
}

export function createEmptySession(
  vendorId: string,
  entityType: EnhanceEntityType,
  entityId: string
): EnhanceSession {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    vendorId,
    entityType,
    entityId,
    messages: [],
    preview: {},
    createdAt: now,
    expiresAt: new Date(Date.now() + SESSION_TTL_SEC * 1000).toISOString()
  };
}
