#!/bin/bash
# Bash script to fix PostgreSQL permissions for apiuser
# Run this script: bash scripts/fix-postgresql-permissions.sh

echo "🔧 Fixing PostgreSQL Permissions for apiuser"
echo ""

# Get PostgreSQL connection details
read -p "Host (default: localhost): " host
host=${host:-localhost}

read -p "Port (default: 5432): " port
port=${port:-5432}

read -p "Database (default: chatlogix): " database
database=${database:-chatlogix}

read -p "PostgreSQL superuser (default: postgres): " postgres_user
postgres_user=${postgres_user:-postgres}

read -sp "PostgreSQL superuser password: " password
echo ""

echo ""
echo "Fixing permissions..."

# Execute SQL script
PGPASSWORD=$password psql -h "$host" -p "$port" -U "$postgres_user" -d "$database" -f "$(dirname "$0")/fix-postgresql-permissions.sql"

if [ $? -eq 0 ]; then
    echo ""
    echo "[SUCCESS] Permissions fixed successfully!"
    echo ""
    echo "The apiuser now has full access to the chatlogix database."
else
    echo ""
    echo "[ERROR] Failed to fix permissions"
    exit 1
fi

echo ""
echo "Done!"

