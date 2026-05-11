-- Quick permission fix for PostgreSQL
-- Run this as postgres superuser: psql -U postgres -d chatlogix -f grant-permissions-quick.sql

-- Grant all permissions on public schema
GRANT ALL ON SCHEMA public TO PUBLIC;
GRANT CREATE ON SCHEMA public TO PUBLIC;

-- If you know your database user, replace 'your_user' with the actual username
-- GRANT ALL ON SCHEMA public TO your_user;
-- GRANT CREATE ON SCHEMA public TO your_user;

-- Grant on all existing objects
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO PUBLIC;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO PUBLIC;

-- Set defaults for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO PUBLIC;

