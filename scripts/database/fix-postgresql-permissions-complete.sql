-- Complete PostgreSQL Permissions Fix for apiuser
-- Run this as postgres superuser: sudo -u postgres psql -d chatlogix -f fix-postgresql-permissions-complete.sql
-- OR: psql -U postgres -h localhost -d chatlogix -f fix-postgresql-permissions-complete.sql

-- First, ensure we're connected to the right database
\c chatlogix

-- Drop and recreate the user to ensure clean state (optional - comment out if you want to keep existing data)
-- DROP USER IF EXISTS apiuser CASCADE;

-- Create the user with password
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_user WHERE usename = 'apiuser') THEN
        CREATE USER apiuser WITH ENCRYPTED PASSWORD 'ChatLogix!';
        RAISE NOTICE 'User apiuser created';
    ELSE
        -- Update password
        ALTER USER apiuser WITH ENCRYPTED PASSWORD 'ChatLogix!';
        RAISE NOTICE 'User apiuser password updated';
    END IF;
END
$$;

-- Grant connection privilege to the database
GRANT CONNECT ON DATABASE chatlogix TO apiuser;

-- Connect to the database as apiuser's context (we'll do this via setting role)
-- But first, grant schema usage
GRANT USAGE ON SCHEMA public TO apiuser;
GRANT CREATE ON SCHEMA public TO apiuser;

-- Grant all privileges on the database
GRANT ALL PRIVILEGES ON DATABASE chatlogix TO apiuser;

-- Grant privileges on all existing tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO apiuser;

-- Grant privileges on all existing sequences
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO apiuser;

-- Grant privileges on all existing functions (if any)
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO apiuser;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO apiuser;

-- Set default privileges for future sequences
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO apiuser;

-- Set default privileges for future functions
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO apiuser;

-- Make apiuser a superuser (if needed - use with caution in production)
-- ALTER USER apiuser WITH SUPERUSER;

-- Or make apiuser the owner of the schema (alternative approach)
ALTER SCHEMA public OWNER TO apiuser;

-- Verify permissions
\echo '=== User Information ==='
\du apiuser

\echo '=== Schema Information ==='
\dn+ public

\echo '=== Testing permissions ==='
-- Test if we can query (this will run as current user, but shows what apiuser should be able to do)
SELECT 
    has_database_privilege('apiuser', 'chatlogix', 'CONNECT') as can_connect,
    has_schema_privilege('apiuser', 'public', 'USAGE') as can_use_schema,
    has_schema_privilege('apiuser', 'public', 'CREATE') as can_create_in_schema;

\echo ''
\echo '=== All tables in public schema ==='
SELECT tablename FROM pg_tables WHERE schemaname = 'public';

\echo ''
\echo '=== Permissions fixed! ==='
\echo 'You can now test the connection with:'
\echo 'psql -U apiuser -d chatlogix -h localhost'
\echo 'Password: ChatLogix!'

