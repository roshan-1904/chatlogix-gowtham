#!/bin/bash

# 🚀 ChatLogix AWS Lightsail Deployment Script
# This script automates the deployment process

set -e  # Exit on any error

echo "🚀 Starting ChatLogix deployment to AWS Lightsail..."

# Configuration
APP_NAME="chatlogix"
APP_DIR="/home/ubuntu/$APP_NAME"
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"
NGINX_SITE="chatlogix"
DOMAIN="yourdomain.com"  # Change this to your actual domain

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   error "This script should not be run as root. Please run as ubuntu user."
fi

# Step 1: Update system
log "Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Step 2: Install Node.js 20
log "Installing Node.js 20..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    log "Node.js already installed: $(node --version)"
fi

# Step 3: Install PM2
log "Installing PM2..."
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
else
    log "PM2 already installed: $(pm2 --version)"
fi

# Step 4: Install additional packages
log "Installing additional packages..."
sudo apt install -y postgresql-client redis-tools nginx certbot python3-certbot-nginx

# Step 5: Create application directory
log "Setting up application directory..."
if [ ! -d "$APP_DIR" ]; then
    mkdir -p "$APP_DIR"
fi

# Step 6: Clone repository (assuming you have the code)
log "Setting up application code..."
if [ ! -d "$APP_DIR/.git" ]; then
    warn "Please ensure your ChatLogix code is in $APP_DIR"
    warn "You can clone it with: git clone <your-repo-url> $APP_DIR"
fi

# Step 7: Install dependencies
log "Installing backend dependencies..."
cd "$BACKEND_DIR"
npm install --production

log "Installing frontend dependencies..."
cd "$FRONTEND_DIR"
npm install --production

# Step 8: Build applications
log "Building backend..."
cd "$BACKEND_DIR"
npm run build

log "Building frontend..."
cd "$FRONTEND_DIR"
npm run build

# Step 9: Create environment file template
log "Creating environment file template..."
cd "$BACKEND_DIR"
if [ ! -f ".env" ]; then
    cat > .env.template << EOF
# ChatLogix Production Environment Variables
# Copy this to .env and fill in your actual values

NODE_ENV=production
PORT=3000
ENABLE_SWAGGER=false

# Database
DATABASE_URL=postgresql://username:password@host:5432/chatlogix

# Redis (Optional)
REDIS_URL=redis://redis-host:6379

# AWS Configuration
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# SQS Queues
INCOMING_QUEUE_URL=https://sqs.ap-south-1.amazonaws.com/account/incoming-queue
RESPONSE_QUEUE_URL=https://sqs.ap-south-1.amazonaws.com/account/response-queue
INCOMING_TEXT_QUEUE_URL=https://sqs.ap-south-1.amazonaws.com/account/text-queue
INCOMING_AUDIO_QUEUE_URL=https://sqs.ap-south-1.amazonaws.com/account/audio-queue
INCOMING_IMAGE_QUEUE_URL=https://sqs.ap-south-1.amazonaws.com/account/image-queue

# WhatsApp Configuration
WHATSAPP_VERIFY_TOKEN=your-verify-token
WHATSAPP_ACCESS_TOKEN=your-access-token
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id
WHATSAPP_APP_SECRET=your-app-secret

# AI Configuration
OPENAI_API_KEY=your-openai-key

# Billing Configuration
BILLING_TEXT_CREDIT=1
BILLING_AUDIO_CREDIT=3
BILLING_IMAGE_CREDIT=2

# Logging
LOG_LEVEL=info
EOF
    warn "Please copy .env.template to .env and fill in your actual values"
fi

# Step 10: Create PM2 ecosystem file
log "Creating PM2 ecosystem configuration..."
cd "$APP_DIR"
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [
    {
      name: 'chatlogix-api',
      script: 'dist/index.js',
      cwd: '$BACKEND_DIR',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true,
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s'
    },
    {
      name: 'response-worker',
      script: 'dist/workers/responseWorker.js',
      cwd: '$BACKEND_DIR',
      env: {
        NODE_ENV: 'production',
        WORKER_TYPE: 'response'
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '512M',
      error_file: './logs/worker-err.log',
      out_file: './logs/worker-out.log',
      log_file: './logs/worker-combined.log',
      time: true,
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
};
EOF

# Step 11: Create logs directory
log "Creating logs directory..."
mkdir -p "$BACKEND_DIR/logs"

# Step 12: Configure Nginx
log "Configuring Nginx..."
sudo cat > /etc/nginx/sites-available/$NGINX_SITE << EOF
server {
    listen 80;
    server_name $DOMAIN api.$DOMAIN;

    # Frontend
    location / {
        root $FRONTEND_DIR/dist;
        index index.html;
        try_files \$uri \$uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # API Backend
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # WhatsApp Webhook
    location /webhook/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
}
EOF

# Enable site
sudo ln -sf /etc/nginx/sites-available/$NGINX_SITE /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
sudo nginx -t || error "Nginx configuration test failed"

# Step 13: Setup PM2 startup
log "Setting up PM2 startup..."
pm2 startup systemd -u ubuntu --hp /home/ubuntu || true

# Step 14: Create systemd service for PM2
log "Creating systemd service..."
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ubuntu --hp /home/ubuntu

# Step 15: Create deployment script
log "Creating deployment script..."
cat > deploy.sh << 'EOF'
#!/bin/bash

# Quick deployment script
echo "🚀 Deploying ChatLogix..."

# Pull latest code
git pull origin main

# Install dependencies
cd backend && npm install --production
cd ../frontend && npm install --production

# Build applications
cd ../backend && npm run build
cd ../frontend && npm run build

# Restart PM2 processes
cd .. && pm2 restart all

echo "✅ Deployment complete!"
EOF

chmod +x deploy.sh

# Step 16: Create health check script
log "Creating health check script..."
cat > health-check.sh << 'EOF'
#!/bin/bash

echo "🔍 ChatLogix Health Check"
echo "========================"

# Check PM2 processes
echo "📊 PM2 Processes:"
pm2 status

echo ""
echo "🌐 API Health:"
curl -s http://localhost:3000/health || echo "API not responding"

echo ""
echo "📁 Disk Usage:"
df -h

echo ""
echo "💾 Memory Usage:"
free -h

echo ""
echo "📋 Recent Logs:"
tail -n 5 backend/logs/combined.log 2>/dev/null || echo "No logs found"
EOF

chmod +x health-check.sh

# Step 17: Create backup script
log "Creating backup script..."
cat > backup.sh << 'EOF'
#!/bin/bash

BACKUP_DIR="/home/ubuntu/backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

echo "📦 Creating backup..."

# Backup database (if DATABASE_URL is set)
if [ ! -z "$DATABASE_URL" ]; then
    echo "🗄️ Backing up database..."
    pg_dump $DATABASE_URL > $BACKUP_DIR/database_$DATE.sql
fi

# Backup application files
echo "📁 Backing up application..."
tar -czf $BACKUP_DIR/app_$DATE.tar.gz backend/logs/ backend/.env

echo "✅ Backup complete: $BACKUP_DIR/"
EOF

chmod +x backup.sh

log "🎉 Deployment setup complete!"
echo ""
echo "📋 Next Steps:"
echo "1. Copy .env.template to .env and fill in your values"
echo "2. Run database migrations: cd backend && npm run prisma:migrate"
echo "3. Start the application: pm2 start ecosystem.config.js"
echo "4. Configure SSL: sudo certbot --nginx -d $DOMAIN -d api.$DOMAIN"
echo "5. Test the deployment: ./health-check.sh"
echo ""
echo "🔧 Useful Commands:"
echo "- Deploy updates: ./deploy.sh"
echo "- Check health: ./health-check.sh"
echo "- Create backup: ./backup.sh"
echo "- View logs: pm2 logs"
echo "- Restart services: pm2 restart all"
echo ""
echo "📚 For detailed instructions, see DEPLOYMENT_GUIDE.md"
