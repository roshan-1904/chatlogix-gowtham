# Manual Deployment Steps

Step-by-step guide to manually deploy your local builds to the server.

> **Note:** Production deploys are now automated — pushing to `master` triggers `.github/workflows/deploy.yml`, which builds the code, updates the 5 Lambda functions, and runs `scripts/deployment/deploy-ec2.sh` on the Bitnami box at `/home/bitnami/chatlogix`. See `docs/DEPLOYMENT.md` for the current, authoritative flow. Keep this guide for manual/one-off deploys (a fresh host, or debugging outside CI) — the PM2 process list below has been updated to match what actually runs today (2 processes, not the 4-5 of earlier setups). It does not cover the Lambda side of the pipeline; see `backend/src/lambdas/README.md` for that.

## Prerequisites

- ✅ Backend build ready: `backend/dist/` folder exists
- ✅ Frontend builds ready: `frontend_v2/apps/web-vendor/dist/` and/or `frontend_v2/apps/web-admin/dist/` exist
- ✅ Server IP address
- ✅ SSH access to server

---

## Step 1: Package Your Builds Locally

### On Windows (PowerShell):

```powershell
# Create a temporary folder
mkdir C:\temp\chatlogix-deploy
cd C:\temp\chatlogix-deploy

# Copy backend
xcopy /E /I C:\Projects\ChatLogix\backend\dist backend\dist
copy C:\Projects\ChatLogix\backend\package.json backend\
xcopy /E /I C:\Projects\ChatLogix\backend\prisma backend\prisma

# Copy frontend
mkdir frontend_v2\apps\web-vendor
xcopy /E /I C:\Projects\ChatLogix\frontend_v2\apps\web-vendor\dist frontend_v2\apps\web-vendor\dist

mkdir frontend_v2\apps\web-admin
xcopy /E /I C:\Projects\ChatLogix\frontend_v2\apps\web-admin\dist frontend_v2\apps\web-admin\dist

# Create zip archive
Compress-Archive -Path * -DestinationPath chatlogix-builds.zip -Force
```

### On Linux/Mac:

```bash
# Create temporary directory
mkdir -p /tmp/chatlogix-deploy
cd /tmp/chatlogix-deploy

# Copy backend
cp -r /path/to/ChatLogix/backend/dist ./backend/
cp /path/to/ChatLogix/backend/package.json ./backend/
cp -r /path/to/ChatLogix/backend/prisma ./backend/ 2>/dev/null || true

# Copy frontend
mkdir -p frontend_v2/apps/web-vendor
cp -r /path/to/ChatLogix/frontend_v2/apps/web-vendor/dist ./frontend_v2/apps/web-vendor/

mkdir -p frontend_v2/apps/web-admin
cp -r /path/to/ChatLogix/frontend_v2/apps/web-admin/dist ./frontend_v2/apps/web-admin/

# Create tar archive
tar -czf chatlogix-builds.tar.gz *
```

---

## Step 2: Transfer to Server

### Using SCP:

**Windows (PowerShell with OpenSSH):**
```powershell
scp C:\temp\chatlogix-deploy\chatlogix-builds.zip ubuntu@your-server-ip:/home/ubuntu/
```

**With SSH key:**
```powershell
scp -i C:\path\to\your-key.pem C:\temp\chatlogix-deploy\chatlogix-builds.zip ubuntu@your-server-ip:/home/ubuntu/
```

**Linux/Mac:**
```bash
scp /tmp/chatlogix-deploy/chatlogix-builds.tar.gz ubuntu@your-server-ip:/home/ubuntu/
```

**With SSH key:**
```bash
scp -i ~/.ssh/your-key.pem /tmp/chatlogix-deploy/chatlogix-builds.tar.gz ubuntu@your-server-ip:/home/ubuntu/
```

### Alternative: Using SFTP

```bash
sftp ubuntu@your-server-ip
put chatlogix-builds.zip /home/ubuntu/
exit
```

---

## Step 3: Connect to Server and Extract

```bash
ssh ubuntu@your-server-ip
```

```bash
# Create app directory
mkdir -p /home/ubuntu/chatlogix
cd /home/ubuntu/chatlogix

# Extract archive
# If zip:
unzip ~/chatlogix-builds.zip

# If tar.gz:
tar -xzf ~/chatlogix-builds.tar.gz

# Verify structure
ls -la backend/dist/
ls -la frontend_v2/apps/web-vendor/dist/
ls -la frontend_v2/apps/web-admin/dist/
```

---

## Step 4: Install Server Dependencies

### Install Node.js 20:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node --version
npm --version
```

### Install PM2:

```bash
sudo npm install -g pm2
pm2 --version
```

### Install Nginx:

```bash
sudo apt update
sudo apt install -y nginx
sudo systemctl status nginx
```

---

## Step 5: Setup Backend

### Install Backend Dependencies:

```bash
cd /home/ubuntu/chatlogix/backend

# Install production dependencies
npm install --only=production

# Generate Prisma client (if prisma folder exists)
npx prisma generate
```

### Create Environment File:

```bash
cd /home/ubuntu/chatlogix/backend
nano .env
```

**Add your configuration:**

```bash
NODE_ENV=production
PORT=3000

# Database (PostgreSQL)
DATABASE_URL=postgresql://user:password@host:5432/chatlogix

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

# OpenAI
OPENAI_API_KEY=sk-your-key

# Billing (optional)
BILLING_TEXT_CREDIT=1
BILLING_AUDIO_CREDIT=3
BILLING_IMAGE_CREDIT=2
```

**Save and secure:**
```bash
chmod 600 .env
```

### Run Database Migrations:

```bash
cd /home/ubuntu/chatlogix/backend
npx prisma migrate deploy
```

---

## Step 6: Configure PM2

### Create PM2 Ecosystem File:

```bash
cd /home/ubuntu/chatlogix
nano ecosystem.config.js
```

**Add this configuration** (mirrors the current root `ecosystem.config.js` — only 2 processes run on PM2 today; the WhatsApp AI pipeline and response dispatch run as AWS Lambda functions in production, not PM2 workers — see `backend/src/lambdas/README.md`):

```javascript
module.exports = {
  apps: [
    {
      name: 'chatlogix-backend',
      script: './backend/dist/index.js',
      cwd: '/home/ubuntu/chatlogix',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './backend/logs/backend-error.log',
      out_file: './backend/logs/backend-out.log',
      log_file: './backend/logs/backend-combined.log',
      time: true,
      max_memory_restart: '1G',
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
      watch: false
    },
    {
      name: 'chatlogix-media-worker',
      script: './backend/dist/workers/mediaWorker.js',
      cwd: '/home/ubuntu/chatlogix',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        WORKER_TYPE: 'media'
      },
      error_file: './backend/logs/media-worker-error.log',
      out_file: './backend/logs/media-worker-out.log',
      log_file: './backend/logs/media-worker-combined.log',
      time: true,
      max_memory_restart: '512M',
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
      watch: false
    }
  ]
};
```

### Create Logs Directory:

```bash
mkdir -p /home/ubuntu/chatlogix/backend/logs
```

### Start PM2 Processes:

```bash
cd /home/ubuntu/chatlogix
pm2 start ecosystem.config.js --env production

# Check status
pm2 status

# Save process list
pm2 save

# Setup PM2 to start on boot
pm2 startup systemd -u ubuntu --hp /home/ubuntu
# Run the command that PM2 outputs (will be something like: sudo env PATH=...)
```

---

## Step 7: Configure Nginx

### Create Nginx Configuration:

```bash
sudo nano /etc/nginx/sites-available/chatlogix
```

**Add this configuration:**

```nginx
# Rate limiting
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=webhook_limit:10m rate=30r/s;

server {
    listen 80;
    server_name your-domain.com api.your-domain.com www.your-domain.com _;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Frontend - web-vendor (default)
    location / {
        root /home/ubuntu/chatlogix/frontend_v2/apps/web-vendor/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # Frontend - web-admin
    location /admin {
        alias /home/ubuntu/chatlogix/frontend_v2/apps/web-admin/dist;
        index index.html;
        try_files $uri $uri/ /admin/index.html;
        
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # API Backend
    location /api/ {
        limit_req zone=api_limit burst=20 nodelay;
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # WhatsApp Webhook
    location /webhook {
        limit_req zone=webhook_limit burst=50 nodelay;
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Health check
    location /health {
        proxy_pass http://localhost:3000/health;
        access_log off;
    }
}
```

**Replace `your-domain.com` with your actual domain, or use `_` for any domain.**

### Enable Site:

```bash
# Enable site
sudo ln -sf /etc/nginx/sites-available/chatlogix /etc/nginx/sites-enabled/

# Remove default site
sudo rm -f /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

---

## Step 8: Verify Deployment

### Check PM2 Status:

```bash
pm2 status
pm2 logs
```

### Test Backend:

```bash
curl http://localhost:3000/health
```

### Test Frontend:

```bash
curl http://localhost
```

### Check Nginx:

```bash
sudo systemctl status nginx
sudo tail -f /var/log/nginx/error.log
```

---

## Step 9: Setup SSL (Optional but Recommended)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get SSL certificate
sudo certbot --nginx -d your-domain.com -d api.your-domain.com -d www.your-domain.com

# Test auto-renewal
sudo certbot renew --dry-run
```

---

## Troubleshooting

### Backend Not Starting:

```bash
# Check logs
pm2 logs chatlogix-backend

# Check if port is in use
sudo netstat -tulpn | grep 3000

# Restart backend
pm2 restart chatlogix-backend

# Check .env file
cat /home/ubuntu/chatlogix/backend/.env
```

### Frontend Not Loading:

```bash
# Check Nginx logs
sudo tail -f /var/log/nginx/error.log

# Verify files exist
ls -la /home/ubuntu/chatlogix/frontend_v2/apps/web-vendor/dist/

# Test Nginx config
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

### Database Connection Issues:

```bash
# Test connection
cd /home/ubuntu/chatlogix/backend
source .env
psql "$DATABASE_URL" -c "SELECT version();"

# Check Prisma
npx prisma db pull
```

### PM2 Not Starting on Boot:

```bash
# Regenerate startup script
pm2 startup systemd -u ubuntu --hp /home/ubuntu
# Run the outputted command

# Save current processes
pm2 save
```

---

## Useful Commands

```bash
# PM2
pm2 status              # Check status
pm2 logs                # View all logs
pm2 logs chatlogix-backend  # View specific app logs
pm2 restart all         # Restart all
pm2 restart chatlogix-backend  # Restart specific app
pm2 monit               # Monitor dashboard
pm2 delete all          # Stop and delete all

# Nginx
sudo nginx -t           # Test configuration
sudo systemctl restart nginx  # Restart
sudo systemctl reload nginx    # Reload config
sudo tail -f /var/log/nginx/error.log  # View errors

# System
df -h                   # Disk usage
free -h                 # Memory usage
htop                    # Process monitor
```

---

## Summary Checklist

- [ ] Package builds locally
- [ ] Transfer to server
- [ ] Extract on server
- [ ] Install Node.js 20
- [ ] Install PM2
- [ ] Install Nginx
- [ ] Install backend dependencies
- [ ] Create .env file
- [ ] Run database migrations
- [ ] Create PM2 ecosystem config
- [ ] Start PM2 processes
- [ ] Configure Nginx
- [ ] Test backend (curl localhost:3000/health)
- [ ] Test frontend (curl localhost)
- [ ] Setup SSL (optional)
- [ ] Verify everything works

---

That's it! Your application should now be running on the server.

