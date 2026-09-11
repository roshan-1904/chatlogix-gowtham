/**
 * One-shot PgBouncer probe — prints SHOW CONFIG + SHOW POOLS (docs/LOAD_TESTING.md §0).
 *
 *   npm run loadtest:probe-pgbouncer
 *
 * Uses PGBOUNCER_ADMIN_URL, or derives from DIRECT_DATABASE_URL (postgres user on 6432).
 */
import './config.js';
import { resolvePgbouncerAdminUrl, snapshotPgbouncer } from './pgbouncerAdmin.js';

function maskUrl(url: string): string {
  try {
    const u = new URL(url.replace(/^postgresql:/, 'postgres:'));
    if (u.password) u.password = '***';
    return u.toString().replace(/^postgres:/, 'postgresql:');
  } catch {
    return '(unparseable url)';
  }
}

async function main(): Promise<void> {
  const adminUrl = resolvePgbouncerAdminUrl();
  if (!adminUrl) {
    console.error('[probe] PgBouncer admin URL not configured.');
    console.error('[probe] Set PGBOUNCER_ADMIN_URL=postgresql://postgres:PASS@HOST:6432/pgbouncer');
    console.error('[probe] (SHOW CONFIG requires the postgres admin user — apiuser is not allowed.)');
    console.error('[probe] Or run on the DB host: bash scripts/deployment/probe-pgbouncer-on-host.sh');
    process.exitCode = 1;
    return;
  }

  console.log(`[probe] admin ${maskUrl(adminUrl)}`);
  const snap = await snapshotPgbouncer(adminUrl);

  console.log('\n=== PgBouncer CONFIG (selected) ===');
  const keys = [
    'pool_mode',
    'default_pool_size',
    'reserve_pool_size',
    'max_client_conn',
    'query_wait_timeout',
    'server_idle_timeout'
  ];
  for (const key of keys) {
    const row = snap.config.find((r) => r.key === key);
    if (row) console.log(`  ${row.key} = ${row.value}`);
  }

  console.log('\n=== PgBouncer POOLS ===');
  if (!snap.pools.length) {
    console.log('  (no pools — idle, or no clients connected yet)');
  } else {
    for (const p of snap.pools) {
      console.log(
        `  ${p.database}/${p.user}: cl_active=${p.clActive} cl_waiting=${p.clWaiting} ` +
          `sv_active=${p.svActive} sv_idle=${p.svIdle} mode=${p.poolMode}`
      );
    }
  }

  console.log('\n=== Summary ===');
  console.log(`  default_pool_size : ${snap.defaultPoolSize ?? 'unknown'}`);
  console.log(`  max_client_conn   : ${snap.maxClientConn ?? 'unknown'}`);
  console.log(`  pool_mode         : ${snap.poolMode ?? 'unknown'}`);
  console.log('\nRun `npm run loadtest:sample` alongside Phase 1 to capture pools under load.');
}

main().catch((err) => {
  console.error('[probe] failed:', err);
  process.exitCode = 1;
});
