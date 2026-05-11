-- Final Fix for PostgreSQL Permissions - No Ownership Change Required
-- Run as postgres superuser: sudo -u postgres psql -d chatlogix -f fix-postgresql-permissions-final.sql

\c chatlogix

\echo '=== Step 1: Check Current Schema Owner ==='
SELECT 
    nspname as schema_name, 
    pg_get_userbyid(nspowner) as current_owner,
    nspowner::regrole as owner_role
FROM pg_namespace 
WHERE nspname = 'public';

\echo ''
\echo '=== Step 2: Create or Update apiuser ==='

-- Create or update apiuser
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_user WHERE usename = 'apiuser') THEN
        CREATE USER apiuser WITH ENCRYPTED PASSWORD 'ChatLogix!';
        RAISE NOTICE '✓ User apiuser created';
    ELSE
        ALTER USER apiuser WITH ENCRYPTED PASSWORD 'ChatLogix!';
        RAISE NOTICE '✓ User apiuser password updated';
    END IF;
END
$$;

\echo ''
\echo '=== Step 3: Grant Database Privileges ==='

-- Grant connection and all privileges on database
GRANT CONNECT ON DATABASE chatlogix TO apiuser;
GRANT ALL PRIVILEGES ON DATABASE chatlogix TO apiuser;

\echo ''
\echo '=== Step 4: Grant Schema Privileges ==='

-- Grant schema usage and create (these don't require ownership)
GRANT USAGE ON SCHEMA public TO apiuser;
GRANT CREATE ON SCHEMA public TO apiuser;

\echo ''
\echo '=== Step 5: Grant Table Privileges ==='

-- Grant privileges on all existing tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO apiuser;

\echo ''
\echo '=== Step 6: Grant Sequence Privileges ==='

-- Grant privileges on all existing sequences
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO apiuser;

\echo ''
\echo '=== Step 7: Grant Function Privileges ==='

-- Grant privileges on all existing functions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO apiuser;

\echo ''
\echo '=== Step 8: Set Default Privileges ==='

-- Set default privileges for future tables (requires ownership or being granted)
-- Try to set these, but they may fail if not owner
DO $$
BEGIN
    BEGIN
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO apiuser;
        RAISE NOTICE '✓ Default table privileges set';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '⚠ Could not set default table privileges: %', SQLERRM;
    END;
    
    BEGIN
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO apiuser;
        RAISE NOTICE '✓ Default sequence privileges set';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '⚠ Could not set default sequence privileges: %', SQLERRM;
    END;
END
$$;

\echo ''
\echo '=== Step 9: Try REASSIGN OWNED (if schema owner is known) ==='

-- If we know the schema owner, we can try REASSIGN OWNED
-- This reassigns all objects owned by a user to another user
DO $$
DECLARE
    schema_owner_name text;
BEGIN
    -- Get the schema owner
    SELECT pg_get_userbyid(nspowner) INTO schema_owner_name
    FROM pg_namespace 
    WHERE nspname = 'public';
    
    RAISE NOTICE 'Schema owner is: %', schema_owner_name;
    
    -- If owner is not apiuser and not postgres, try to reassign
    IF schema_owner_name != 'apiuser' AND schema_owner_name != 'postgres' THEN
        BEGIN
            -- Reassign all objects from current owner to apiuser
            EXECUTE format('REASSIGN OWNED BY %I TO apiuser', schema_owner_name);
            RAISE NOTICE '✓ Reassigned objects to apiuser';
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE '⚠ Could not reassign objects: %', SQLERRM;
        END;
    END IF;
END
$$;

\echo ''
\echo '=== Step 10: Verification ==='

-- Verify user exists
SELECT 
    CASE 
        WHEN EXISTS (SELECT FROM pg_catalog.pg_user WHERE usename = 'apiuser') 
        THEN '✓ User apiuser exists'
        ELSE '✗ User apiuser does NOT exist'
    END as user_status;

-- Check database permissions
SELECT 
    has_database_privilege('apiuser', 'chatlogix', 'CONNECT') as can_connect,
    has_database_privilege('apiuser', 'chatlogix', 'CREATE') as can_create;

-- Check schema permissions
SELECT 
    has_schema_privilege('apiuser', 'public', 'USAGE') as can_use_schema,
    has_schema_privilege('apiuser', 'public', 'CREATE') as can_create_in_schema;

-- Check table permissions (sample)
SELECT 
    COUNT(*) as total_tables,
    COUNT(*) FILTER (WHERE has_table_privilege('apiuser', schemaname||'.'||tablename, 'SELECT')) as tables_with_select,
    COUNT(*) FILTER (WHERE has_table_privilege('apiuser', schemaname||'.'||tablename, 'INSERT')) as tables_with_insert
FROM pg_tables 
WHERE schemaname = 'public';

\echo ''
\echo '=== If ownership change is still needed ==='
\echo 'You may need to connect as the actual schema owner to change ownership.'
\echo 'To find the owner, see the output above.'
\echo ''
\echo 'Then connect as that user and run:'
\echo 'ALTER SCHEMA public OWNER TO apiuser;'

