# Database Connection Troubleshooting

If you're seeing errors like:
```
Can't reach database server at `localhost:3306`
```

## Quick Diagnostic

Run the diagnostic script:
```powershell
cd backend
npx tsx scripts/test-db-connection.ts
```

This will test your database connection and provide detailed diagnostics.

## Common Issues and Solutions

### 1. Database Server Not Reachable

**Symptoms:**
- Error: "Can't reach database server"
- Connection timeout

**Solutions:**
- Check if your MySQL server is running
- Verify your `DATABASE_URL` in `.env` file
- Check your network connection
- Try pinging the database host
- Verify MySQL service is started (Windows: Services, Linux: `systemctl status mysql`)

### 2. Authentication Failed

**Symptoms:**
- Connection refused
- Authentication fails
- "Access denied" errors

**Solutions:**
1. Verify username and password in DATABASE_URL
2. Check MySQL user permissions
3. Ensure the user has access to the specified database
4. For local MySQL, verify root password or create a dedicated user

### 3. Database Does Not Exist

**Symptoms:**
- "Unknown database" error
- Database not found

**Solutions:**
1. Create the database:
   ```sql
   CREATE DATABASE chatlogix CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
2. Grant permissions to your user:
   ```sql
   GRANT ALL PRIVILEGES ON chatlogix.* TO 'username'@'localhost';
   FLUSH PRIVILEGES;
   ```

### 4. Connection Limit Exceeded

**Symptoms:**
- "Too many connections" errors
- Intermittent connection failures

**Solutions:**
- Check MySQL connection limit: `SHOW VARIABLES LIKE 'max_connections';`
- Increase connection limit in MySQL configuration if needed
- Close unused connections
- Use connection pooling if available

### 5. Incorrect DATABASE_URL Format

**Symptoms:**
- "Invalid DATABASE_URL format" errors
- Connection string parsing errors

**Correct Format:**
```
mysql://[user]:[password]@[host]:[port]/[database]
```

**Example:**
```
mysql://root:password@localhost:3306/chatlogix
```

**For remote MySQL:**
```
mysql://user:password@your-mysql-server.com:3306/chatlogix
```

**With SSL (if required):**
```
mysql://user:password@host:3306/database?sslaccept=strict
```

### 6. Port Issues

**Symptoms:**
- Connection refused on port 3306
- Port already in use

**Solutions:**
1. Verify MySQL is listening on the correct port (default: 3306)
2. Check firewall settings
3. For remote connections, ensure port 3306 is open
4. Verify MySQL bind-address in my.cnf/my.ini

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

### Method 3: Using MySQL Command Line
```powershell
mysql -u username -p -h hostname database_name
```

Or using connection string format:
```powershell
mysql "mysql://user:password@host:3306/database"
```

## Environment Variables

Make sure your `.env` file (in `backend/` or project root) contains:

```env
DATABASE_URL=mysql://username:password@host:3306/database_name
```

**Local MySQL Example:**
```env
DATABASE_URL=mysql://root:yourpassword@localhost:3306/chatlogix
```

**Remote MySQL Example:**
```env
DATABASE_URL=mysql://user:password@your-mysql-server.com:3306/chatlogix
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

## MySQL-Specific Tips

1. **Character Set**: Use `utf8mb4` for full Unicode support (emojis, etc.)
2. **Connection Timeout**: Add `connect_timeout=10` parameter if connections are timing out
3. **SSL**: For production, use SSL connections with `?sslaccept=strict`
4. **Connection Limits**: Monitor your connection usage, especially in production
5. **UUID Support**: Ensure MySQL 5.7+ for UUID() function support

## Still Having Issues?

1. Check MySQL server logs for detailed error messages
2. Verify MySQL service is running
3. Check application logs for more detailed error messages
4. Test connection using MySQL command line client
5. Verify network connectivity to MySQL server
6. Check MySQL user permissions and database access rights
