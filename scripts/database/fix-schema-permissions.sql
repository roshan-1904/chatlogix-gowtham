-- Fix PostgreSQL Schema Permissions
-- Run this as the postgres superuser: psql -U postgres -f fix-schema-permissions.sql
-- Or connect first: psql -U postgres, then run: \i fix-schema-permissions.sql

-- Connect to the chatlogix database
\c chatlogix

-- Grant permissions on public schema to all users (common fix for PostgreSQL 15+)
-- This allows any user to create objects in the public schema
GRANT ALL ON SCHEMA public TO PUBLIC;
GRANT CREATE ON SCHEMA public TO PUBLIC;

-- If you're using a specific user (replace 'your_user' with your actual database user)
-- Uncomment and modify the lines below:
-- DO $$
-- DECLARE
--     db_user TEXT;
-- BEGIN
--     -- Extract user from current connection
--     SELECT current_user INTO db_user;
--     
--     -- Grant all privileges on schema
--     EXECUTE format('GRANT ALL ON SCHEMA public TO %I', db_user);
--     EXECUTE format('GRANT CREATE ON SCHEMA public TO %I', db_user);
--     
--     -- Grant privileges on all existing objects
--     EXECUTE format('GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO %I', db_user);
--     EXECUTE format('GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO %I', db_user);
--     EXECUTE format('GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO %I', db_user);
--     
--     -- Set default privileges for future objects
--     EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO %I', db_user);
--     EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO %I', db_user);
--     EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO %I', db_user);
-- END
-- $$;

-- Show current permissions
\dn+ public

-- Show current user
SELECT current_user, current_database();

