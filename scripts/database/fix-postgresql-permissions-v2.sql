-- Fix PostgreSQL Permissions - Version 2 (handles schema ownership issues)
-- Run as postgres superuser: sudo -u postgres psql -d chatlogix -f fix-postgresql-permissions-v2.sql

\c chatlogix

-- First, check current schema owner
\echo '=== Current Schema Owner ==='
SELECT nspname as schema_name, pg_get_userbyid(nspowner) as owner
FROM pg_namespace 
WHERE nspname = 'public';

\echo ''
\echo '=== Creating/Updating apiuser ==='

-- Create or update apiuser
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_user WHERE usename = 'apiuser') THEN
        CREATE USER apiuser WITH ENCRYPTED PASSWORD 'ChatLogix!';
        RAISE NOTICE 'User apiuser created';
    ELSE
        ALTER USER apiuser WITH ENCRYPTED PASSWORD 'ChatLogix!';
        RAISE NOTICE 'User apiuser password updated';
    END IF;
END
$$;

\echo ''
\echo '=== Granting Database Privileges ==='

-- Grant connection privilege (this should work)
GRANT CONNECT ON DATABASE chatlogix TO apiuser;

-- Grant all privileges on database
GRANT ALL PRIVILEGES ON DATABASE chatlogix TO apiuser;

\echo ''
\echo '=== Granting Schema Privileges ==='

-- Grant schema usage and create (these should work even if not owner)
GRANT USAGE ON SCHEMA public TO apiuser;
GRANT CREATE ON SCHEMA public TO apiuser;

\echo ''
\echo '=== Attempting to Change Schema Owner ==='
\echo 'If this fails, you may need to connect as the current schema owner'

-- Try to change schema owner (may fail if not superuser or not current owner)
DO $$
BEGIN
    -- Check if we can change owner
    IF EXISTS (
        SELECT 1 FROM pg_namespace 
        WHERE nspname = 'public' 
        AND nspowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)
    ) THEN
        ALTER SCHEMA public OWNER TO apiuser;
        RAISE NOTICE 'Schema owner changed to apiuser';
    ELSE
        RAISE NOTICE 'Cannot change schema owner - current user is not the owner';
        RAISE NOTICE 'You may need to connect as the schema owner to change ownership';
    END IF;
END
$$;

\echo ''
\echo '=== Granting Table Privileges ==='

-- Grant privileges on all existing tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO apiuser;

\echo ''
\echo '=== Granting Sequence Privileges ==='

-- Grant privileges on all existing sequences
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO apiuser;

\echo ''
\echo '=== Setting Default Privileges ==='

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO apiuser;

-- Set default privileges for future sequences
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO apiuser;

\echo ''
\echo '=== Verification ==='

-- Verify user exists
SELECT 
    CASE 
        WHEN EXISTS (SELECT FROM pg_catalog.pg_user WHERE usename = 'apiuser') 
        THEN '✓ User apiuser exists'
        ELSE '✗ User apiuser does NOT exist'
    END as user_check;

-- Check permissions
SELECT 
    has_database_privilege('apiuser', 'chatlogix', 'CONNECT') as can_connect,
    has_schema_privilege('apiuser', 'public', 'USAGE') as can_use_schema,
    has_schema_privilege('apiuser', 'public', 'CREATE') as can_create_in_schema;

\echo ''
\echo '=== If schema owner change failed, run this as the schema owner: ==='
\echo 'ALTER SCHEMA public OWNER TO apiuser;'
\echo ''
\echo 'To find the schema owner, run:'
\echo 'SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = ''public'';'

