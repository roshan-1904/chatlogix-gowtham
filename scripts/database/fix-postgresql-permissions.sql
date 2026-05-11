-- Fix PostgreSQL Permissions for apiuser
-- Run this script as postgres superuser: psql -U postgres -f fix-postgresql-permissions.sql

-- Connect to the chatlogix database
\c chatlogix

-- Create the user if it doesn't exist (or update password if it does)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_user WHERE usename = 'apiuser') THEN
        CREATE USER apiuser WITH ENCRYPTED PASSWORD 'ChatLogix!';
    ELSE
        ALTER USER apiuser WITH ENCRYPTED PASSWORD 'ChatLogix!';
    END IF;
END
$$;

-- Grant database privileges
GRANT ALL PRIVILEGES ON DATABASE chatlogix TO apiuser;

-- Grant schema privileges (PostgreSQL 15+)
GRANT ALL ON SCHEMA public TO apiuser;
GRANT CREATE ON SCHEMA public TO apiuser;

-- Grant privileges on all existing tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO apiuser;

-- Grant privileges on all existing sequences (for auto-increment columns)
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO apiuser;

-- Set default privileges for future tables and sequences
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO apiuser;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO apiuser;

-- Make apiuser the owner of the public schema (optional, but ensures full access)
-- ALTER SCHEMA public OWNER TO apiuser;

-- Verify permissions
\du apiuser
\dn+ public

-- Show current user and database
SELECT current_user, current_database();

