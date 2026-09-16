# 🚀 ChatLogix PostgreSQL Deployment Guide

> **Note:** This document has been updated to reflect the migration from Supabase to in-house PostgreSQL. For historical reference, the original Supabase deployment guide has been archived.
>
> **Also note:** `scripts/deployment/lightsail-deploy.sh`, referenced several times below, was deleted as dead code (2026-09-02) — production deploys are now automated via `.github/workflows/deploy.yml` + `scripts/deployment/deploy-ec2.sh` (see `docs/DEPLOYMENT.md`). The PostgreSQL/Prisma guidance below (connection strings, migrations, monitoring queries) is still accurate regardless.

## 🎯 **PostgreSQL Integration Benefits**

✅ **Full control** - Complete database management  
✅ **Cost-effective** - No per-project fees  
✅ **Customizable** - Configure to your exact needs  
✅ **Secure** - Direct control over security policies  
✅ **Scalable** - Scale resources as needed  

## 📊 **Updated Architecture**

```
Internet → Lightsail Instance → Nginx → Node.js API + Workers
                                    ↓
                          In-House PostgreSQL Database
```

## 🔧 **PostgreSQL Configuration**

### **Step 1: Database Connection Details**

Your PostgreSQL database connection string format:

```bash
# Standard PostgreSQL connection
postgresql://[user]:[password]@[host]:[port]/[database]

# Example for local PostgreSQL
postgresql://chatlogix_user:your_password@localhost:5432/chatlogix

# Example for remote PostgreSQL
postgresql://chatlogix_user:your_password@your-db-host.com:5432/chatlogix
```

### **Step 2: Update Environment Variables**

```bash
# In your .env file
DATABASE_URL=postgresql://chatlogix_user:your_password@your-db-host:5432/chatlogix
```

### **Step 3: Database Schema**

Your existing Prisma schema works perfectly with PostgreSQL! Just run:

```bash
# Generate Prisma client
npm run prisma:generate

# Apply migrations
npm run prisma:migrate
```

## 💰 **Cost Comparison**

### **With In-House PostgreSQL**
- **Lightsail Instance**: $10/month
- **PostgreSQL**: Included (or separate DB instance ~$15/month)
- **SQS + Transfer**: ~$3/month
- **Total**: **$13-28/month**

### **Alternative Options**
- **Lightsail + Lightsail DB**: $25/month
- **Lightsail + RDS**: $25-40/month
- **EC2 + RDS**: $30-50/month

## 🚀 **Quick Deployment Steps**

### **1. Create Lightsail Instance**
```bash
# Ubuntu 22.04 LTS, $10/month plan
# Name: chatlogix-production
```

### **2. Setup PostgreSQL Database**

If using PostgreSQL on the same instance:
```bash
# Install PostgreSQL
sudo apt update
sudo apt install -y postgresql postgresql-contrib

# Create database and user
sudo -u postgres psql
CREATE DATABASE chatlogix;
CREATE USER chatlogix_user WITH ENCRYPTED PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE chatlogix TO chatlogix_user;
\q
```

Or use a managed PostgreSQL service (AWS RDS, DigitalOcean, etc.)

### **3. Run Deployment Script**
```bash
# Upload lightsail-deploy.sh to your instance
chmod +x scripts/deployment/lightsail-deploy.sh
./scripts/deployment/lightsail-deploy.sh
```

### **4. Configure Database Connection**
```bash
cd /home/ubuntu/chatlogix/backend
cp .env.template .env
nano .env
```

**Fill in your PostgreSQL connection details:**
```bash
DATABASE_URL=postgresql://chatlogix_user:your_password@localhost:5432/chatlogix
```

### **5. Setup Database**
```bash
# Apply your existing schema to PostgreSQL
npm run prisma:migrate
npm run prisma:generate
```

### **6. Start Application**
```bash
cd /home/ubuntu/chatlogix
pm2 start ecosystem.config.js
```

## 🔄 **Response Worker with PostgreSQL**

The response worker works with PostgreSQL:

```javascript
// Worker processes messages and logs to PostgreSQL
await prisma.message.create({
  data: {
    conversationId,
    content: text,
    senderType: 'system',
    type: 'text'
  }
});
```

**Benefits:**
- ✅ **Reliable storage** - PostgreSQL with transaction support
- ✅ **Full control** - Direct database access
- ✅ **Customizable** - Configure backups, replication, etc.
- ✅ **Monitoring** - Use your preferred monitoring tools

## 📊 **PostgreSQL Features You Can Use**

### **1. Connection Pooling**
```javascript
// Prisma automatically handles connection pooling
// Configure in DATABASE_URL:
postgresql://user:pass@host:5432/db?connection_limit=10&pool_timeout=20
```

### **2. Transactions**
```javascript
// Use Prisma transactions for complex operations
await prisma.$transaction([
  prisma.message.create({ data: {...} }),
  prisma.conversation.update({ where: {...}, data: {...} })
]);
```

### **3. Full-Text Search**
```sql
-- PostgreSQL full-text search capabilities
CREATE INDEX idx_message_content_fts ON "Message" 
USING gin(to_tsvector('english', content));
```

## 🔧 **Environment Template**

```bash
# ChatLogix Production Environment
NODE_ENV=production
PORT=3000

# PostgreSQL Database
DATABASE_URL=postgresql://chatlogix_user:your_password@your-db-host:5432/chatlogix

# AWS Configuration
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# SQS Queues
INCOMING_QUEUE_URL=https://sqs.ap-south-1.amazonaws.com/account/incoming-queue
RESPONSE_QUEUE_URL=https://sqs.ap-south-1.amazonaws.com/account/response-queue

# WhatsApp Business API
WHATSAPP_VERIFY_TOKEN=your-verify-token
WHATSAPP_ACCESS_TOKEN=your-access-token
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id

# OpenAI API
OPENAI_API_KEY=your-openai-key

# Billing — seed/fallback only; live values live in PlatformSettings
# (see docs/BILLING_AND_PRICING.md)
USD_TO_INR_RATE=83
PLATFORM_FEE_PER_TURN_MILLI=0
PLATFORM_FEE_OUTBOUND_MEDIA_MILLI=0
TRIAL_GRANT_MILLI=50000
```

> `BILLING_TEXT_CREDIT` / `BILLING_AUDIO_CREDIT` / `BILLING_IMAGE_CREDIT` were removed in the 2026-09-16 billing rework — setting them does nothing. The billing vars above seed the `PlatformSettings` singleton on first boot and are a fallback after that; change them live on the web-admin `/billing` page instead.

## 🚀 **Deployment Commands**

```bash
# 1. Connect to Lightsail
ssh -i your-key.pem ubuntu@your-instance-ip

# 2. Run deployment script
chmod +x scripts/deployment/lightsail-deploy.sh
./scripts/deployment/lightsail-deploy.sh

# 3. Configure PostgreSQL connection
cd /home/ubuntu/chatlogix/backend
cp .env.template .env
nano .env  # Add your PostgreSQL DATABASE_URL

# 4. Setup database
npm run prisma:migrate

# 5. Start application
cd .. && pm2 start ecosystem.config.js

# 6. Check status
pm2 status
./health-check.sh
```

## 🔍 **Monitoring PostgreSQL**

### **Database Monitoring**
- **PostgreSQL logs**: `/var/log/postgresql/`
- **Query Performance**: Use `EXPLAIN ANALYZE` for slow queries
- **Connection Monitoring**: `SELECT * FROM pg_stat_activity;`
- **Database Size**: `SELECT pg_size_pretty(pg_database_size('chatlogix'));`

### **Application Monitoring**
```bash
# Check database connection
curl http://localhost:3000/health

# View logs
pm2 logs chatlogix-api
pm2 logs response-worker

# Database queries
psql -U chatlogix_user -d chatlogix -c "SELECT COUNT(*) FROM \"Vendor\";"
```

## 🆘 **Troubleshooting**

### **Common Issues**
1. **Database connection failed**: Check DATABASE_URL format and credentials
2. **Migration errors**: Verify PostgreSQL is running and accessible
3. **Permission denied**: Check user privileges: `GRANT ALL ON SCHEMA public TO chatlogix_user;`
4. **Connection timeout**: Verify PostgreSQL is listening and firewall allows connections

### **Debug Commands**
```bash
# Test database connection
psql $DATABASE_URL -c "SELECT version();"

# Check Prisma connection
cd backend && npx prisma db pull

# View PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-*.log

# Check active connections
psql -U chatlogix_user -d chatlogix -c "SELECT count(*) FROM pg_stat_activity;"
```

## 🎉 **Benefits of In-House PostgreSQL + Lightsail**

✅ **Cost-effective**: No per-project database fees  
✅ **Reliable**: PostgreSQL with proven stability  
✅ **Full control**: Configure backups, replication, and scaling  
✅ **Scalable**: Add resources as needed  
✅ **Simple**: Direct database access  
✅ **Secure**: Complete control over security policies  

This combination gives you a production-ready ChatLogix deployment with full control and maximum flexibility! 🚀
