# Fix PostgreSQL Permissions - Step by Step

## Problem: Peer Authentication Failed

This error occurs because PostgreSQL is using "peer" authentication for local connections, which requires the system user to match the database user.

## Solution: Connect as postgres superuser first

### Step 1: Connect as postgres superuser

**On Linux/Mac:**
```bash
sudo -u postgres psql
```

**On Windows (if using WSL or similar):**
```bash
# If you're already logged in as a user with PostgreSQL access
psql -U postgres
```

**Or if you need to specify host:**
```bash
psql -U postgres -h localhost
```

### Step 2: Run the permission fix commands

Once connected to PostgreSQL, run these commands:

```sql
-- Connect to the chatlogix database
\c chatlogix

-- Create the apiuser if it doesn't exist
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

-- Grant database privileges
GRANT ALL PRIVILEGES ON DATABASE chatlogix TO apiuser;

-- Grant schema privileges
GRANT ALL ON SCHEMA public TO apiuser;
GRANT CREATE ON SCHEMA public TO apiuser;

-- Grant privileges on all existing tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO apiuser;

-- Grant privileges on all existing sequences
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO apiuser;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO apiuser;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO apiuser;

-- Verify the user was created
\du apiuser

-- Exit
\q
```

### Step 3: Test the connection

Now test connecting as apiuser via TCP/IP (localhost):

```bash
psql -U apiuser -d chatlogix -h localhost
# Enter password: ChatLogix!
```

If this works, your application should now be able to connect!

## Alternative: Use TCP/IP connection from the start

If you want to avoid peer authentication issues, always connect via TCP/IP:

```bash
# Connect as postgres via TCP/IP
psql -U postgres -h localhost -d chatlogix

# Then run the same SQL commands as above
```

## Troubleshooting

### If you can't connect as postgres:

1. **Check if PostgreSQL is running:**
   ```bash
   sudo systemctl status postgresql
   # or
   pg_isready
   ```

2. **Try connecting with password:**
   ```bash
   psql -U postgres -h localhost -W
   ```

3. **Check pg_hba.conf configuration:**
   ```bash
   sudo nano /etc/postgresql/15/main/pg_hba.conf
   ```
   
   Make sure you have a line like:
   ```
   host    all             all             127.0.0.1/32            scram-sha-256
   ```

4. **Restart PostgreSQL after changing pg_hba.conf:**
   ```bash
   sudo systemctl restart postgresql
   ```

