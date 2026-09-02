# Database Connection Troubleshooting

> **Note:** This guide was originally written for MySQL, from a migration attempt that has since been reverted — the project's Prisma schema (`backend/prisma/schema.prisma`) uses `provider = "postgresql"` today, and `DATABASE_URL` in `backend/.env.example` points at Supabase Postgres. This version has been rewritten for PostgreSQL. If you're troubleshooting a `mysql://` connection string somewhere, you're most likely looking at stale config left over from that migration — see `documentation/modules/setup/guides/mysql-migration-checklist.md` and `mysql-verification.md` for that (archived) history.

If you're seeing errors like:
```
Can't reach database server at `localhost:5432`
```

## Quick Diagnostic

Run the diagnostic script:
```powershell
cd backend
npx tsx scripts/test-db-connection.ts
```

This will test your database connection and provide detailed diagnostics (connection details, database version, and a couple of schema sanity checks). It's PostgreSQL-specific today.

## Common Issues and Solutions

### 1. Database Server Not Reachable

**Symptoms:**
- Error: "Can't reach database server"
- Connection timeout

**Solutions:**
- Check if your PostgreSQL server is running
- Verify your `DATABASE_URL` in `.env` file
- Check your network connection
- Try pinging the database host
- Verify PostgreSQL service is started (Windows: Services, Linux: `systemctl status postgresql`)
- If using Supabase (the default `DATABASE_URL` in `backend/.env.example` points at `*.supabase.co`), check the Supabase project dashboard isn't paused

### 2. Authentication Failed

**Symptoms:**
- Connection refused
- Authentication fails
- "Access denied" / "password authentication failed" errors

**Solutions:**
1. Verify username and password in `DATABASE_URL`
2. Check PostgreSQL user permissions
3. Ensure the user has access to the specified database
4. For local PostgreSQL, verify the postgres superuser password or create a dedicated user
5. If you're hitting "permission denied for schema public", see the GRANT commands in `documentation/modules/setup/guides/database.md`

### 3. Database Does Not Exist

**Symptoms:**
- "database ... does not exist" error
- Database not found

**Solutions:**
1. Create the database:
   ```sql
   CREATE DATABASE chatlogix;
   ```
2. Grant permissions to your user:
   ```sql
   GRANT ALL PRIVILEGES ON DATABASE chatlogix TO your_user;
   ```

### 4. Connection Limit Exceeded

**Symptoms:**
- "too many connections" errors
- Intermittent connection failures

**Solutions:**
- Check the connection limit: `SHOW max_connections;`
- Increase the connection limit in PostgreSQL configuration if needed (or on Supabase, check your plan's pooler limits)
- Close unused connections
- Use connection pooling (e.g. PgBouncer, or Supabase's built-in pooler) if available

### 5. Incorrect DATABASE_URL Format

**Symptoms:**
- "Invalid DATABASE_URL format" errors
- Connection string parsing errors

**Correct Format:**
```
postgresql://[user]:[password]@[host]:[port]/[database]?schema=public
```

**Example:**
```
postgresql://postgres:password@localhost:5432/chatlogix?schema=public
```

**For Supabase (matches `backend/.env.example`):**
```
postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres
```

**With SSL (if required):**
```
postgresql://user:password@host:5432/database?sslmode=require
```

### 6. Port Issues

**Symptoms:**
- Connection refused on port 5432
- Port already in use

**Solutions:**
1. Verify PostgreSQL is listening on the correct port (default: `5432`)
2. Check firewall settings
3. For remote connections, ensure port 5432 is open
4. Verify PostgreSQL's `listen_addresses` in `postgresql.conf` and the matching rule in `pg_hba.conf`

## Testing Your Connection

### Method 1: Using the Diagnostic Script
```powershell
cd backend
npx tsx scripts/test-db-connection.ts
```

### Method 2: Using Prisma Studio
```powershell
cd backend
npx prisma studio
```

### Method 3: Using psql
```powershell
psql -U username -d database_name -h hostname
```

Or using connection string format:
```powershell
psql "postgresql://user:password@host:5432/database"
```

## Environment Variables

Make sure your `.env` file (in `backend/`) contains:

```env
DATABASE_URL=postgresql://username:password@host:5432/database_name?schema=public
```

**Local PostgreSQL Example:**
```env
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/chatlogix?schema=public
```

**Supabase Example (see `backend/.env.example` for the current default):**
```env
DATABASE_URL=postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres
```

## Connection Configuration

For better connection handling, you can configure Prisma connection pooling:

```typescript
// In prisma.ts
export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});
```

## PostgreSQL-Specific Tips

1. **Schema:** the app expects the `public` schema — Prisma's `schema.prisma` uses `@@map` to keep table names PascalCase (see root `CLAUDE.md`)
2. **Connection Timeout**: add `connect_timeout=10` as a query param if connections are timing out
3. **SSL**: for hosted Postgres (Supabase included), you may need `?sslmode=require`
4. **Connection Limits**: monitor connection usage, especially in production — prefer Supabase's pooler / PgBouncer over raw connections at scale
5. **Peer authentication**: on Linux hosts (e.g. Bitnami), local `psql` access commonly fails with "Peer authentication failed" — see `documentation/modules/setup/guides/bitnami.md` for the fix

## Still Having Issues?

1. Check PostgreSQL server logs for detailed error messages
2. Verify the PostgreSQL service is running
3. Check application logs for more detailed error messages
4. Test the connection using `psql`
5. Verify network connectivity to the database server
6. Check PostgreSQL user permissions and database access rights
