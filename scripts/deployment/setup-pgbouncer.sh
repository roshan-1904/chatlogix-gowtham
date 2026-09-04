#!/usr/bin/env bash
# Run this ON the Lightsail box (ssh in first). Installs and configures PgBouncer
# in transaction-pooling mode in front of the existing local Postgres 16.
#
# Does NOT touch port 5432, DATABASE_URL, or any Lambda config — this only stands
# PgBouncer up and lets you validate it locally before anything is cut over.
# See the "PgBouncer connection pooling" plan for the full rollout sequence.
set -euo pipefail

DB_NAME="chatlogix"
DB_USER="apiuser"
PGBOUNCER_PORT="6432"

echo "=== Current Postgres connection settings (for sizing default_pool_size) ==="
sudo -u postgres psql -d "$DB_NAME" -c "SHOW max_connections;" -c "SHOW superuser_reserved_connections;" -c "SHOW password_encryption;"

read -p "Enter default_pool_size (see output above; start conservative, e.g. 15): " POOL_SIZE
POOL_SIZE="${POOL_SIZE:-15}"

echo "=== Installing pgbouncer ==="
sudo apt-get update
sudo apt-get install -y pgbouncer

if [ -f /etc/default/pgbouncer ]; then
  sudo sed -i 's/^START=0/START=1/' /etc/default/pgbouncer || true
fi

AUTH_TYPE=$(sudo -u postgres psql -d "$DB_NAME" -tAc "SHOW password_encryption;" | tr -d '[:space:]')
if [ "$AUTH_TYPE" != "scram-sha-256" ] && [ "$AUTH_TYPE" != "md5" ]; then
  echo "Unexpected password_encryption '$AUTH_TYPE' — defaulting auth_type to md5. Verify manually."
  AUTH_TYPE="md5"
fi
echo "=== Using auth_type=$AUTH_TYPE ==="

echo "=== Writing /etc/pgbouncer/pgbouncer.ini ==="
sudo tee /etc/pgbouncer/pgbouncer.ini > /dev/null <<EOF
[databases]
${DB_NAME} = host=127.0.0.1 port=5432 dbname=${DB_NAME}

[pgbouncer]
listen_addr = *
listen_port = ${PGBOUNCER_PORT}
auth_type = ${AUTH_TYPE}
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
max_client_conn = 500
default_pool_size = ${POOL_SIZE}
reserve_pool_size = 5
reserve_pool_timeout = 3
min_pool_size = 0
server_idle_timeout = 300
query_wait_timeout = 15
ignore_startup_parameters = extra_float_digits
server_reset_query = DISCARD ALL
admin_users = postgres
stats_users = postgres
logfile = /var/log/postgresql/pgbouncer.log
EOF

echo "=== Writing /etc/pgbouncer/userlist.txt (reusing apiuser's existing password hash) ==="
HASH=$(sudo -u postgres psql -d "$DB_NAME" -tAc "SELECT passwd FROM pg_shadow WHERE usename = '${DB_USER}';")
if [ -z "$HASH" ]; then
  echo "ERROR: could not read password hash for role '${DB_USER}' from pg_shadow." >&2
  exit 1
fi
sudo tee /etc/pgbouncer/userlist.txt > /dev/null <<EOF
"${DB_USER}" "${HASH}"
EOF
sudo chown postgres:postgres /etc/pgbouncer/userlist.txt /etc/pgbouncer/pgbouncer.ini
sudo chmod 0640 /etc/pgbouncer/userlist.txt

echo "=== Confirming pg_hba.conf allows ${DB_USER} from 127.0.0.1 (loopback) ==="
HBA_FILE=$(sudo -u postgres psql -tAc "SHOW hba_file;")
sudo grep -E "127\.0\.0\.1|::1" "$HBA_FILE" || echo "WARNING: no loopback rule found in $HBA_FILE — add one before continuing, or PgBouncer -> Postgres will fail auth."

echo "=== Enabling pgbouncer ==="
sudo systemctl enable --now pgbouncer
sudo systemctl status pgbouncer --no-pager

echo ""
echo "=== Next: validate before opening any firewall ==="
echo "  psql \"postgresql://${DB_USER}:<pwd>@127.0.0.1:${PGBOUNCER_PORT}/${DB_NAME}\" -c \"SELECT 1;\""
echo "  psql \"host=127.0.0.1 port=${PGBOUNCER_PORT} dbname=pgbouncer user=postgres\" -c \"SHOW POOLS;\""
