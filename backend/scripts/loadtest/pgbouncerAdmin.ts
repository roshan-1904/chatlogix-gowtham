/**
 * PgBouncer admin console helpers (SHOW CONFIG / SHOW POOLS / SHOW STATS).
 *
 * Requires a postgres superuser (or other admin_users entry) connecting to the
 * special `pgbouncer` database on the pooler port — see setup-pgbouncer.sh.
 */
import { PrismaClient } from '@prisma/client';

export interface PgbouncerConfigRow {
  key: string;
  value: string;
}

export interface PgbouncerPoolRow {
  database: string;
  user: string;
  clActive: number;
  clWaiting: number;
  clActiveCancelReq: number;
  clWaitingCancelReq: number;
  svActive: number;
  svActiveCancel: number;
  svBeingCanceled: number;
  svIdle: number;
  svUsed: number;
  svTested: number;
  svLogin: number;
  maxwait: number;
  maxwaitUs: number;
  poolMode: string;
}

/** Build `postgresql://…:6432/pgbouncer` from a direct Postgres URL (5432). */
export function derivePgbouncerAdminUrl(directUrl: string): string {
  const u = new URL(directUrl.replace(/^postgresql:/, 'postgres:'));
  u.port = '6432';
  u.pathname = '/pgbouncer';
  u.search = '';
  return u.toString().replace(/^postgres:/, 'postgresql:');
}

export function resolvePgbouncerAdminUrl(): string | null {
  if (process.env.PGBOUNCER_ADMIN_URL) return process.env.PGBOUNCER_ADMIN_URL;
  if (process.env.DIRECT_DATABASE_URL) {
    const derived = derivePgbouncerAdminUrl(process.env.DIRECT_DATABASE_URL);
    try {
      const user = new URL(derived.replace(/^postgresql:/, 'postgres:')).username;
      // setup-pgbouncer.sh sets admin_users = postgres; apiuser gets FATAL: not allowed.
      if (user && user !== 'postgres') return null;
    } catch {
      return null;
    }
    return derived;
  }
  return null;
}

function parsePipeTable(stdout: string): string[][] {
  const lines = stdout.trim().split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  return lines.slice(1).map((line) => line.split('|'));
}

async function runShow(adminUrl: string, command: 'CONFIG' | 'POOLS' | 'STATS'): Promise<string> {
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  try {
    const rows = await admin.$queryRawUnsafe<Array<{ show: string }>>(`SHOW ${command}`);
    // Prisma may return one row per line or a single blob — normalize both shapes.
    if (rows.length === 1 && typeof rows[0]?.show === 'string' && rows[0].show.includes('\n')) {
      return rows[0].show;
    }
    return rows.map((r) => (typeof r === 'object' && r && 'show' in r ? String(r.show) : String(r))).join('\n');
  } catch (err) {
    // Some drivers return row objects keyed by column name from SHOW output.
    try {
      const rows = await admin.$queryRawUnsafe<Record<string, string>[]>(`SHOW ${command}`);
      if (!rows.length) return '';
      const keys = Object.keys(rows[0]);
      if (keys.length >= 2) {
        const header = keys.join('|');
        const body = rows.map((row) => keys.map((k) => row[k] ?? '').join('|')).join('\n');
        return `${header}\n${body}`;
      }
    } catch {
      /* fall through */
    }
    throw err;
  } finally {
    await admin.$disconnect();
  }
}

export async function fetchPgbouncerConfig(adminUrl: string): Promise<PgbouncerConfigRow[]> {
  const raw = await runShow(adminUrl, 'CONFIG');
  return parsePipeTable(raw).map(([key, value]) => ({ key, value }));
}

export async function fetchPgbouncerPools(adminUrl: string): Promise<PgbouncerPoolRow[]> {
  const raw = await runShow(adminUrl, 'POOLS');
  return parsePipeTable(raw).map((cols) => ({
    database: cols[0] ?? '',
    user: cols[1] ?? '',
    clActive: Number(cols[2] ?? 0),
    clWaiting: Number(cols[3] ?? 0),
    clActiveCancelReq: Number(cols[4] ?? 0),
    clWaitingCancelReq: Number(cols[5] ?? 0),
    svActive: Number(cols[6] ?? 0),
    svActiveCancel: Number(cols[7] ?? 0),
    svBeingCanceled: Number(cols[8] ?? 0),
    svIdle: Number(cols[9] ?? 0),
    svUsed: Number(cols[10] ?? 0),
    svTested: Number(cols[11] ?? 0),
    svLogin: Number(cols[12] ?? 0),
    maxwait: Number(cols[13] ?? 0),
    maxwaitUs: Number(cols[14] ?? 0),
    poolMode: cols[15] ?? ''
  }));
}

export function configValue(config: PgbouncerConfigRow[], key: string): string | undefined {
  return config.find((r) => r.key === key)?.value;
}

export async function snapshotPgbouncer(adminUrl: string): Promise<{
  config: PgbouncerConfigRow[];
  pools: PgbouncerPoolRow[];
  defaultPoolSize: string | undefined;
  maxClientConn: string | undefined;
  poolMode: string | undefined;
}> {
  const config = await fetchPgbouncerConfig(adminUrl);
  const pools = await fetchPgbouncerPools(adminUrl);
  return {
    config,
    pools,
    defaultPoolSize: configValue(config, 'default_pool_size'),
    maxClientConn: configValue(config, 'max_client_conn'),
    poolMode: configValue(config, 'pool_mode')
  };
}
