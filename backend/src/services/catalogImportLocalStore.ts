import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ImportStorageError } from './importStorageService.js';

const ROOT = path.resolve(process.cwd(), '.tmp', 'catalog-imports');

interface LocalMeta {
  contentType: string;
  sizeBytes: number;
}

function resolveSafe(key: string): string {
  if (!key.startsWith('imports/') || key.includes('\0')) {
    throw new ImportStorageError(403, 'FORBIDDEN_KEY', 'S3 key does not belong to this vendor');
  }
  const resolved = path.resolve(ROOT, key);
  const relative = path.relative(ROOT, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new ImportStorageError(403, 'FORBIDDEN_KEY', 'S3 key does not belong to this vendor');
  }
  return resolved;
}

export async function writeLocalImport(
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  const filePath = resolveSafe(key);
  await mkdir(path.dirname(filePath), { recursive: true });
  const meta: LocalMeta = { contentType, sizeBytes: body.length };
  await writeFile(filePath, body);
  await writeFile(`${filePath}.meta.json`, JSON.stringify(meta));
}

export async function headLocalImport(
  key: string
): Promise<{ contentType: string; sizeBytes: number } | null> {
  try {
    const raw = await readFile(`${resolveSafe(key)}.meta.json`, 'utf8');
    const meta = JSON.parse(raw) as LocalMeta;
    if (!meta.contentType || !Number.isFinite(meta.sizeBytes)) return null;
    return { contentType: meta.contentType, sizeBytes: meta.sizeBytes };
  } catch (err) {
    if (err instanceof ImportStorageError) throw err;
    return null;
  }
}

export async function fetchLocalImport(
  key: string
): Promise<{ buffer: Buffer; contentType: string; sizeBytes: number } | null> {
  const meta = await headLocalImport(key);
  if (!meta) return null;
  try {
    const buffer = await readFile(resolveSafe(key));
    return { buffer, contentType: meta.contentType, sizeBytes: buffer.length };
  } catch (err) {
    if (err instanceof ImportStorageError) throw err;
    return null;
  }
}
