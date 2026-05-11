-- Verify PostgreSQL Permissions for apiuser
-- Run this to check if permissions are correctly set

\c chatlogix

\echo '=== Checking apiuser permissions ==='

-- Check if user exists
SELECT 
    CASE 
        WHEN EXISTS (SELECT FROM pg_catalog.pg_user WHERE usename = 'apiuser') 
        THEN 'User apiuser EXISTS'
        ELSE 'User apiuser DOES NOT EXIST'
    END as user_status;

-- Check database privileges
SELECT 
    has_database_privilege('apiuser', 'chatlogix', 'CONNECT') as can_connect,
    has_database_privilege('apiuser', 'chatlogix', 'CREATE') as can_create_db,
    has_database_privilege('apiuser', 'chatlogix', 'TEMPORARY') as can_create_temp;

-- Check schema privileges
SELECT 
    has_schema_privilege('apiuser', 'public', 'USAGE') as can_use_schema,
    has_schema_privilege('apiuser', 'public', 'CREATE') as can_create_in_schema;

-- Check table privileges (sample)
SELECT 
    schemaname,
    tablename,
    has_table_privilege('apiuser', schemaname||'.'||tablename, 'SELECT') as can_select,
    has_table_privilege('apiuser', schemaname||'.'||tablename, 'INSERT') as can_insert,
    has_table_privilege('apiuser', schemaname||'.'||tablename, 'UPDATE') as can_update,
    has_table_privilege('apiuser', schemaname||'.'||tablename, 'DELETE') as can_delete
FROM pg_tables 
WHERE schemaname = 'public' 
LIMIT 10;

-- Check schema owner
SELECT 
    nspname as schema_name,
    pg_get_userbyid(nspowner) as owner
FROM pg_namespace 
WHERE nspname = 'public';

