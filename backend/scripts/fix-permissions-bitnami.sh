#!/bin/bash
# Fix PostgreSQL Permissions on Bitnami
# This script helps fix permissions for Bitnami PostgreSQL installations

echo "=== Fixing PostgreSQL Permissions on Bitnami ==="
echo ""

# Try different connection methods
# Method 1: Use sudo to switch to postgres user
echo "Attempting Method 1: Using sudo to connect as postgres user..."
sudo -u postgres psql -d chatlogix <<EOF
GRANT ALL ON SCHEMA public TO PUBLIC;
GRANT CREATE ON SCHEMA public TO PUBLIC;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO PUBLIC;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO PUBLIC;
\q
EOF

if [ $? -eq 0 ]; then
    echo "✓ Permissions fixed successfully!"
    exit 0
fi

echo ""
echo "Method 1 failed. Trying Method 2: Connect via TCP/IP..."
echo ""

# Method 2: Try connecting via TCP/IP (localhost)
# Extract connection details from DATABASE_URL if available
if [ -n "$DATABASE_URL" ]; then
    # Parse DATABASE_URL: postgresql://user:password@host:port/database
    DB_USER=$(echo $DATABASE_URL | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
    DB_PASS=$(echo $DATABASE_URL | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
    DB_HOST=$(echo $DATABASE_URL | sed -n 's/.*@\([^:]*\):.*/\1/p')
    DB_PORT=$(echo $DATABASE_URL | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
    DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')
    
    if [ -n "$DB_HOST" ] && [ -n "$DB_USER" ]; then
        echo "Connecting to $DB_HOST:$DB_PORT/$DB_NAME as $DB_USER..."
        export PGPASSWORD="$DB_PASS"
        psql -h $DB_HOST -p ${DB_PORT:-5432} -U $DB_USER -d $DB_NAME <<EOF
GRANT ALL ON SCHEMA public TO PUBLIC;
GRANT CREATE ON SCHEMA public TO PUBLIC;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO PUBLIC;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO PUBLIC;
\q
EOF
        unset PGPASSWORD
        
        if [ $? -eq 0 ]; then
            echo "✓ Permissions fixed successfully!"
            exit 0
        fi
    fi
fi

echo ""
echo "If both methods failed, try these options:"
echo ""
echo "Option 1: Check if you're the postgres user:"
echo "  sudo su - postgres"
echo "  psql -d chatlogix"
echo "  # Then run the GRANT commands manually"
echo ""
echo "Option 2: Connect via TCP/IP with your DATABASE_URL user:"
echo "  psql \$DATABASE_URL"
echo "  # Then run the GRANT commands manually"
echo ""
echo "Option 3: Check pg_hba.conf and modify authentication method"
echo "  sudo nano /opt/bitnami/postgresql/conf/pg_hba.conf"
echo "  # Change 'peer' to 'md5' or 'trust' for local connections"
echo "  # Then restart: sudo /opt/bitnami/ctlscript.sh restart postgresql"
echo ""

exit 1

