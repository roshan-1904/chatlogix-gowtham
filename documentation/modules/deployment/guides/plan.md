# ChatLogix AWS Production Deployment Plan

> **⚠️ Superseded.** This plan describes an earlier point in the system's evolution — a single Express process, one response worker, and 2 SQS queues (incoming/response). None of that matches production today: the live pipeline is 5 AWS Lambda functions (`chatlogix-webhook-handler`, `chatlogix-incoming-response-generator`, `chatlogix-whatsapp-response-dispatcher`, `chatlogix-order-recovery`, `chatlogix-media-fetcher`) behind API Gateway, feeding 4+ SQS queues (text/audio/image/response + media-fetch), with only `chatlogix-backend` and `chatlogix-media-worker` still running on PM2. `scripts/deployment/lightsail-deploy.sh`, referenced below, was deleted as dead code (2026-09-02). For the current, authoritative deployment process see `docs/DEPLOYMENT.md` and `backend/src/lambdas/README.md`. The "Current Architecture" section and diagram below are kept as historical record of the original plan, not as a description of today's system.

## Overview

Deploy ChatLogix to production using:
- **AWS Lightsail** - Ubuntu server for hosting backend API and frontend
- **PostgreSQL** - In-house PostgreSQL database
- **AWS SQS** - Message queuing for WhatsApp responses
- **AWS Lambda** (Optional) - Serverless response worker
- **Nginx** - Reverse proxy and static file serving
- **Let's Encrypt** - Free SSL certificates

## Current Architecture

The application consists of:

1. **Backend API** (Express.js)
   - REST API endpoints (`/api/*`)
   - WhatsApp webhook receiver (`/webhook`)
   - Health check (`/health`)
   - Processes incoming messages synchronously
   - Queues responses to SQS

2. **Response Worker** (Node.js)
   - Polls SQS `RESPONSE_QUEUE_URL`
   - Sends WhatsApp replies via Meta API
   - Can run as PM2 process OR AWS Lambda

3. **Frontend** (React + Vite)
   - Static build served by Nginx
   - Admin dashboard for vendors and orders

4. **Dependencies**
   - PostgreSQL database (in-house)
   - SQS queues (2 queues: incoming, response)
   - WhatsApp Business API credentials
   - OpenAI API key

## Deployment Architecture Diagram

```
                    ┌─────────────────┐
                    │   Internet      │
                    └────────┬────────┘
                             │
                    ┌────────┴────────┐
                    │   CloudFlare    │
                    │   DNS + CDN     │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
    ┌─────────▼─────────┐        ┌─────────▼──────────┐
    │  WhatsApp Webhook │        │   Web Browsers     │
    │   (Meta Servers)  │        │   (Vendors/Admin)  │
    └─────────┬─────────┘        └─────────┬──────────┘
              │                             │
              │    ┌────────────────────────┘
              │    │
    ┌─────────▼────▼──────────────────────────────┐
    │   AWS Lightsail Instance (Ubuntu 22.04)     │
    │   Static IP: xxx.xxx.xxx.xxx                │
    │                                              │
    │   ┌──────────────────────────────────────┐  │
    │   │         Nginx (Port 80/443)          │  │
    │   │  - Reverse Proxy                     │  │
    │   │  - SSL Termination                   │  │
    │   │  - Static File Serving               │  │
    │   └───────────┬──────────────────────────┘  │
    │               │                              │
    │   ┌───────────┴───────────┐                 │
    │   │                       │                 │
    │   ▼                       ▼                 │
    │ ┌─────────────┐    ┌──────────────┐        │
    │ │Backend API  │    │  Frontend    │        │
    │ │(Node:3000)  │    │  (Static)    │        │
    │ │- PM2 Managed│    │- React Build │        │
    │ └──────┬──────┘    └──────────────┘        │
    │        │                                    │
    │ ┌──────▼──────────┐                        │
    │ │Response Worker  │                        │
    │ │(Node - PM2)     │                        │
    │ │- Polls SQS      │◄─────────┐             │
    │ └─────────────────┘          │             │
    └──────────┬───────────────────┼─────────────┘
               │                   │
       ┌───────┼───────────────────┼─────┐
       │       │                   │     │
   ┌───▼───────▼──┐   ┌───────────▼──┐  │
   │  PostgreSQL  │   │   AWS SQS    │  │
   │   Database   │   │   Queues:    │  │
   │              │   │  - incoming  │  │
   │  - Customer  │   │  - response  │  │
   │  - Vendor    │   └──────────────┘  │
   │  - Order     │                     │
   │  - Message   │   ┌─────────────┐   │
   └──────────────┘   │  WhatsApp   │   │
                      │  Business   │◄──┘
                      │     API     │
                      └─────────────┘
```

## Deployment Strategy

### Option A: Lightsail Only (Recommended for Start)
- Simple, single-server deployment
- Lower initial cost ($47-50/month)
- Easy debugging and monitoring
- Manual scaling required

### Option B: Lightsail + Lambda (Recommended for Scale)
- Serverless workers (pay-per-use)
- Auto-scaling message processing
- Better resource utilization
- Slightly higher complexity

---

## Phase 1: Pre-Deployment Setup (AWS Console)

### Step 1.1: Create AWS SQS Queues

Create two Standard queues in AWS SQS (Region: ap-south-1):

1. `chatlogix-incoming-queue`
2. `chatlogix-response-queue`

**Configuration for both queues:**
- Type: Standard
- Message retention: 14 days
- Visibility timeout: 30 seconds
- Receive message wait time: 20 seconds (long polling)
- Maximum message size: 256 KB

**Expected Queue URLs:**
```
INCOMING_QUEUE_URL=https://sqs.ap-south-1.amazonaws.com/123456789012/chatlogix-incoming-queue
RESPONSE_QUEUE_URL=https://sqs.ap-south-1.amazonaws.com/123456789012/chatlogix-response-queue
```

### Step 1.2: Create IAM User with SQS Permissions

1. Create IAM user: `chatlogix-backend`
2. Enable programmatic access
3. Attach policy: `AmazonSQSFullAccess` (or custom policy below)
4. Create Access Key and save credentials

**Custom IAM Policy (Least Privilege - Recommended):**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ChatLogixSQSAccess",
      "Effect": "Allow",
      "Action": [
        "sqs:SendMessage",
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes",
        "sqs:GetQueueUrl"
      ],
      "Resource": [
        "arn:aws:sqs:ap-south-1:ACCOUNT_ID:chatlogix-incoming-queue",
        "arn:aws:sqs:ap-south-1:ACCOUNT_ID:chatlogix-response-queue"
      ]
    }
  ]
}
```

### Step 1.3: Setup PostgreSQL Database

**Option 1: PostgreSQL on Lightsail Instance (Recommended for Start)**
```bash
# Install PostgreSQL on the same instance
sudo apt update
sudo apt install -y postgresql postgresql-contrib

# Create database and user
sudo -u postgres psql
CREATE DATABASE chatlogix;
CREATE USER chatlogix_user WITH ENCRYPTED PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE chatlogix TO chatlogix_user;
\c chatlogix
GRANT ALL ON SCHEMA public TO chatlogix_user;
\q
```

**Option 2: Managed PostgreSQL Service**
- AWS RDS PostgreSQL
- DigitalOcean Managed Databases
- Other managed PostgreSQL providers

**Connection String Format:**
```
postgresql://chatlogix_user:[PASSWORD]@[HOST]:5432/chatlogix
```

### Step 1.4: Create AWS Lightsail Instance

1. Platform: Linux/Unix
2. Blueprint: Ubuntu 22.04 LTS
3. Instance Plan: **$20/month (4GB RAM, 2 vCPU, 80GB SSD)** - Recommended
4. Instance name: `chatlogix-production`
5. Enable Automatic Snapshots
6. Attach Static IP
7. Configure Firewall: Allow ports 22, 80, 443

### Step 1.5: Get WhatsApp Business API Credentials

Required credentials:
- `WHATSAPP_VERIFY_TOKEN` - Create your own (random string)
- `WHATSAPP_ACCESS_TOKEN` - From Meta Business Console
- `WHATSAPP_PHONE_NUMBER_ID` - From Meta Business Console
- `WHATSAPP_APP_SECRET` - From Meta App Dashboard

### Step 1.6: Get OpenAI API Key

Get from: https://platform.openai.com/api-keys

---

## Phase 2: Server Initial Setup

### Step 2.1: Connect to Lightsail Instance

```bash
# Download SSH key from Lightsail Console
# Set permissions:
chmod 400 LightsailDefaultKey-ap-south-1.pem

# Connect:
ssh -i LightsailDefaultKey-ap-south-1.pem ubuntu@YOUR_STATIC_IP
```

### Step 2.2: Run Automated Setup Script

```bash
# Upload the deployment script:
scp -i LightsailDefaultKey-ap-south-1.pem scripts/deployment/lightsail-deploy.sh ubuntu@YOUR_STATIC_IP:~/scripts/deployment/

# On server:
chmod +x scripts/deployment/lightsail-deploy.sh
./scripts/deployment/lightsail-deploy.sh
```

**What the script installs:**
- Node.js 20
- PM2 (process manager)
- Nginx (web server)
- PostgreSQL client tools
- Utility scripts

---

## Phase 3: Deploy Application Code

### Step 3.1: Upload Application Code

**Option 1: Git Clone (Recommended)**
```bash
cd /home/ubuntu
git clone https://github.com/YOUR_USERNAME/ChatLogix.git chatlogix
```

**Option 2: SCP Upload**
```bash
# Local machine:
tar -czf chatlogix.tar.gz backend/ frontend/
scp -i key.pem chatlogix.tar.gz ubuntu@YOUR_IP:~/
# Server:
tar -xzf chatlogix.tar.gz
```

### Step 3.2: Install Dependencies & Build

```bash
# Backend:
cd /home/ubuntu/chatlogix/backend
npm install --only=production
npm run build

# Frontend:
cd /home/ubuntu/chatlogix/frontend
npm install --only=production
npm run build
```

### Step 3.3: Configure Environment Variables

```bash
cd /home/ubuntu/chatlogix/backend
nano .env
```

**Template:**
```bash
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Database (PostgreSQL)
DATABASE_URL=postgresql://chatlogix_user:PASSWORD@localhost:5432/chatlogix

# AWS
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...

# SQS Queues
INCOMING_QUEUE_URL=https://sqs.ap-south-1.amazonaws.com/ACCOUNT/chatlogix-incoming-queue
RESPONSE_QUEUE_URL=https://sqs.ap-south-1.amazonaws.com/ACCOUNT/chatlogix-response-queue

# WhatsApp
WHATSAPP_VERIFY_TOKEN=your_verify_token
WHATSAPP_ACCESS_TOKEN=EAAxxxxx
WHATSAPP_PHONE_NUMBER_ID=1234567890
WHATSAPP_APP_SECRET=your_secret

# OpenAI
OPENAI_API_KEY=sk-...

# Billing
BILLING_TEXT_CREDIT=1
BILLING_AUDIO_CREDIT=3
BILLING_IMAGE_CREDIT=2
```

**Secure the file:**
```bash
chmod 600 .env
```

### Step 3.4: Initialize Database

```bash
cd /home/ubuntu/chatlogix/backend

# Generate Prisma Client:
npx prisma generate

# Apply migrations:
npx prisma migrate deploy

# Verify connection:
npx prisma db pull
```

---

## Phase 4: Process Management (PM2)

### Step 4.1: Create PM2 Ecosystem Configuration

```bash
cd /home/ubuntu/chatlogix
nano ecosystem.config.js
```

**Configuration:**
```javascript
module.exports = {
  apps: [
    {
      name: 'chatlogix-api',
      script: 'dist/index.js',
      cwd: '/home/ubuntu/chatlogix/backend',
      env: { NODE_ENV: 'production', PORT: 3000 },
      instances: 1,
      max_memory_restart: '1G',
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      time: true,
      autorestart: true
    },
    {
      name: 'response-worker',
      script: 'dist/workers/responseWorker.js',
      cwd: '/home/ubuntu/chatlogix/backend',
      env: { NODE_ENV: 'production', WORKER_TYPE: 'response' },
      instances: 1,
      max_memory_restart: '512M',
      error_file: './logs/worker-error.log',
      out_file: './logs/worker-out.log',
      time: true,
      autorestart: true
    }
  ]
};
```

### Step 4.2: Start Applications

```bash
# Create logs directory:
mkdir -p /home/ubuntu/chatlogix/backend/logs

# Start all apps:
pm2 start ecosystem.config.js

# Check status:
pm2 status

# Save process list:
pm2 save

# Enable startup on boot:
pm2 startup systemd -u ubuntu --hp /home/ubuntu
# Run the command that's output
```

### Step 4.3: Setup Log Rotation

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

---

## Phase 5: Nginx Configuration

### Step 5.1: Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/chatlogix
```

**Full Configuration:**
```nginx
# Rate limiting
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=webhook_limit:10m rate=30r/s;

server {
    listen 80;
    server_name yourdomain.com api.yourdomain.com www.yourdomain.com;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Frontend
    location / {
        root /home/ubuntu/chatlogix/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
        
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # API Backend
    location /api/ {
        limit_req zone=api_limit burst=20 nodelay;
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WhatsApp Webhook
    location /webhook {
        limit_req zone=webhook_limit burst=50 nodelay;
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Health check
    location /health {
        proxy_pass http://localhost:3000;
        access_log off;
    }
}
```

### Step 5.2: Enable Site

```bash
# Enable site:
sudo ln -sf /etc/nginx/sites-available/chatlogix /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test configuration:
sudo nginx -t

# Restart Nginx:
sudo systemctl restart nginx
```

### Step 5.3: Setup SSL

```bash
# Install Certbot:
sudo apt install certbot python3-certbot-nginx -y

# Get SSL certificate:
sudo certbot --nginx -d yourdomain.com -d api.yourdomain.com -d www.yourdomain.com

# Test auto-renewal:
sudo certbot renew --dry-run
```

---

## Phase 6: DNS and Domain Configuration

### Step 6.1: Configure DNS Records

Add these records in your DNS provider:

```
Type    Name    Value                           TTL
A       @       YOUR_LIGHTSAIL_STATIC_IP        300
A       api     YOUR_LIGHTSAIL_STATIC_IP        300
A       www     YOUR_LIGHTSAIL_STATIC_IP        300
```

### Step 6.2: Configure WhatsApp Webhook

In Meta Business Console:
1. Callback URL: `https://yourdomain.com/webhook`
2. Verify Token: Your `WHATSAPP_VERIFY_TOKEN`
3. Subscribe to: `messages`, `message_status`

**Verify:**
```bash
curl "https://yourdomain.com/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test123"
# Should return: test123
```

---

## Phase 7: Monitoring and Utilities

### Step 7.1: Create Health Check Script

```bash
cd /home/ubuntu/chatlogix
nano health-check.sh
```

```bash
#!/bin/bash
echo "ChatLogix Health Check"
echo "======================"
pm2 status
echo ""
curl -s http://localhost:3000/health || echo "API down"
echo ""
df -h / | tail -1
free -h | grep Mem
```

```bash
chmod +x health-check.sh
```

### Step 7.2: Create Backup Script

```bash
nano backup.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/home/ubuntu/backups"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"

source /home/ubuntu/chatlogix/backend/.env
PGPASSWORD=$(echo "$DATABASE_URL" | grep -oP 'postgres:\K[^@]+')
PGHOST=$(echo "$DATABASE_URL" | grep -oP '@\K[^:]+')

PGPASSWORD="$PGPASSWORD" pg_dump -h "$PGHOST" -U postgres -d postgres \
  > "$BACKUP_DIR/db_$DATE.sql"
gzip "$BACKUP_DIR/db_$DATE.sql"

# Cleanup old backups (7 days)
find "$BACKUP_DIR" -name "db_*.sql.gz" -mtime +7 -delete

echo "Backup complete: $BACKUP_DIR/db_$DATE.sql.gz"
```

```bash
chmod +x backup.sh
```

### Step 7.3: Schedule Automated Tasks

```bash
crontab -e
```

Add:
```
# Health check every 15 minutes
*/15 * * * * /home/ubuntu/chatlogix/health-check.sh >> /home/ubuntu/chatlogix/health.log 2>&1

# Daily backup at 2 AM
0 2 * * * /home/ubuntu/chatlogix/backup.sh >> /home/ubuntu/chatlogix/backup.log 2>&1
```

---

## Phase 8: Testing and Verification

### Step 8.1: API Health Checks

```bash
# Local test:
curl http://localhost:3000/health

# External test:
curl https://yourdomain.com/health

# Webhook verification:
curl "https://yourdomain.com/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test"
```

### Step 8.2: WhatsApp Integration Test

```bash
# Watch logs:
pm2 logs chatlogix-api --lines 0

# Send test WhatsApp message to your business number
# Check logs for:
# - Webhook received
# - Message processed
# - Response queued
```

### Step 8.3: SQS Queue Monitoring

```bash
# Install AWS CLI:
sudo apt install awscli -y
aws configure

# Check queue depth:
source /home/ubuntu/chatlogix/backend/.env
aws sqs get-queue-attributes \
  --queue-url "$RESPONSE_QUEUE_URL" \
  --attribute-names ApproximateNumberOfMessages
```

---

## Optional: Lambda Worker Setup

### Step 9.1: Prepare Lambda Package

```bash
# On local machine:
cd backend
npm install --only=production
npm run build

mkdir lambda-deploy
cp -r dist lambda-deploy/
cp -r node_modules lambda-deploy/
cd lambda-deploy
zip -r ../chatlogix-lambda.zip .
```

### Step 9.2: Create Lambda Function

In AWS Lambda Console:
1. Function name: `chatlogix-response-worker`
2. Runtime: Node.js 20.x
3. Architecture: arm64
4. Handler: `dist/lambda/responseWorker.handler`
5. Memory: 512 MB
6. Timeout: 30 seconds
7. Upload `chatlogix-lambda.zip`
8. Add environment variables (same as backend .env)

### Step 9.3: Configure SQS Trigger

1. Add Trigger: SQS
2. Queue: `chatlogix-response-queue`
3. Batch size: 10
4. Enable trigger

### Step 9.4: Disable PM2 Worker

```bash
pm2 stop response-worker
pm2 delete response-worker
pm2 save
```

---

## Cost Breakdown

### Option A: Lightsail + PM2 Worker
- Lightsail (4GB): $20/month
- PostgreSQL (on instance): $0/month
- SQS: ~$0.40/month
- **Total: ~$21/month**

### Option B: Lightsail + Lambda
- Lightsail (4GB): $20/month
- PostgreSQL (on instance): $0/month
- SQS: ~$0.40/month
- Lambda: ~$1.25/month
- **Total: ~$22/month**

### Option C: Lightsail + Managed PostgreSQL
- Lightsail (4GB): $20/month
- Managed PostgreSQL: $15-25/month
- SQS: ~$0.40/month
- **Total: ~$36-46/month**

---

## Security Checklist

- [ ] SSH key-based authentication only
- [ ] Firewall configured (ports 22, 80, 443 only)
- [ ] SSL certificate installed
- [ ] Environment variables secured (chmod 600)
- [ ] WhatsApp signature verification enabled
- [ ] Nginx rate limiting configured
- [ ] Database backups automated
- [ ] PM2 log rotation enabled

---

## Maintenance Tasks

### Daily
- Check PM2 status
- Review error logs

### Weekly
- Run health check
- Review SQS metrics
- Verify backups

### Monthly
- Apply security updates: `sudo apt update && sudo apt upgrade`
- Review database performance
- Analyze costs
- Test backup restoration

---

## Troubleshooting

### API Not Responding
```bash
pm2 status
pm2 logs chatlogix-api
curl http://localhost:3000/health
sudo netstat -tulpn | grep 3000
pm2 restart chatlogix-api
```

### Database Connection Failed
```bash
source .env
psql "$DATABASE_URL" -c "SELECT version();"
```

### Worker Not Processing
```bash
pm2 logs response-worker
aws sqs get-queue-attributes --queue-url "$RESPONSE_QUEUE_URL" --attribute-names ApproximateNumberOfMessages
pm2 restart response-worker
```

---

## Useful Commands

### PM2
```bash
pm2 status
pm2 logs
pm2 restart all
pm2 monit
```

### Nginx
```bash
sudo nginx -t
sudo systemctl restart nginx
sudo tail -f /var/log/nginx/error.log
```

### Database
```bash
npx prisma studio
npx prisma migrate deploy
npx prisma db pull
```

---

## Final Deployment Checklist

### Pre-Deployment
- [ ] SQS queues created
- [ ] IAM user with SQS permissions
- [ ] PostgreSQL database accessible
- [ ] Lightsail instance with static IP
- [ ] Domain DNS configured
- [ ] All credentials obtained

### Deployment
- [ ] Server setup completed
- [ ] Code deployed and built
- [ ] Environment configured
- [ ] Database migrated
- [ ] PM2 processes running
- [ ] Nginx configured
- [ ] SSL certificate installed

### Post-Deployment
- [ ] Health checks passing
- [ ] WhatsApp webhook verified
- [ ] Test message successful
- [ ] SQS processing working
- [ ] Monitoring configured
- [ ] Backups scheduled

---

**Estimated Deployment Time:** 2-4 hours

**Monthly Cost:** $47-51

**Next Steps:**
1. Monitor for 48 hours
2. Test with real vendors
3. Optimize based on usage
4. Scale as needed

Good luck with your deployment! 🚀

