#!/usr/bin/env bash
# Run ON the Lightsail / database host (where PgBouncer listens on 6432).
# Prints default_pool_size and current pool stats — no remote postgres password needed.
set -euo pipefail

echo "=== PgBouncer CONFIG (selected) ==="
sudo -u postgres psql -h 127.0.0.1 -p 6432 -d pgbouncer -Atc "SHOW CONFIG" | grep -E '^(pool_mode|default_pool_size|reserve_pool_size|max_client_conn|query_wait_timeout)'

echo ""
echo "=== PgBouncer POOLS ==="
sudo -u postgres psql -h 127.0.0.1 -p 6432 -d pgbouncer -c "SHOW POOLS"
