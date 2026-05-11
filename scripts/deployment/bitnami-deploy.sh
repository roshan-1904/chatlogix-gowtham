#!/bin/bash

# 🚀 ChatLogix Bitnami Lightsail Deployment Script
# Optimized for Bitnami Ubuntu instances

set -e

echo "🚀 ChatLogix Bitnami Deployment Starting..."

# Configuration
APP_NAME="chatlogix"
APP_DIR="/home/bitnami/$APP_NAME"
DOMAIN="yourdomain.com"  # Change this!

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date +'%H:%M:%S')] $1${NC}"; }
warn() { echo -e "${YELLOW}[$(date +'%H:%M:%S')] $1${NC}"; }
error() { echo -e "${RED}[$(date +'%H:%M:%S')] $1${NC}"; exit 1; }

# Check if running as bitnami user
if [[ $EUID -eq 0 ]]; then
   error "Don't run as root! Use: sudo -u bitnami $0"
fi

# Step 1: System Update
log "Updating system..."
sudo apt update && sudo apt upgrade -y

# Step 2: Install Node.js 20 (Bitnami might have older version)
log "Installing Node.js 20..."
if ! command -v node &> /dev/null || [[ $(node --version | cut -d'.' -f1 | cut -d'v' -f2) -lt 20 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi
log "Node.js version: $(node --version)"

# Step 3: Install PM2
log "Installing PM2..."
sudo npm install -g pm2

# Step 4: Install additional tools
log "Installing additional tools..."
sudo apt install -y postgresql-client redis-tools certbot python3-certbot-nginx htop

# Step 5: Setup application directory
log "Setting up application..."
if [ ! -d "$APP_DIR" ]; then
    mkdir -p "$APP_DIR"
    warn "Please upload your ChatLogix code to $APP_DIR"
    warn "You can use: git clone <your-repo> $APP_DIR"
fi

# Step 6: Install dependencies
log "Installing dependencies..."
cd "$APP_DIR/backend"
npm install --production

cd "$APP_DIR/frontend"
npm install --production

# Step 7: Build applications
log "Building applications..."
cd "$APP_DIR/backend"
npm run build

cd "$APP_DIR/frontend"
npm run build

# Step 8: Create environment template
log "Creating environment template..."
cd "$APP_DIR/backend"
cat > .env.template << 'EOF'
# ChatLogix Production Environment
NODE_ENV=production
PORT=3000

# Database (PostgreSQL)
# For local PostgreSQL: postgresql://chatlogix_user:password@localhost:5432/chatlogix
# For remote PostgreSQL: postgresql://chatlogix_user:password@your-db-host:5432/chatlogix
DATABASE_URL=postgresql://chatlogix_user:[password]@localhost:5432/chatlogix

# AWS Configuration
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# SQS Queues (Create these in AWS Console)
INCOMING_QUEUE_URL=https://sqs.ap-south-1.amazonaws.com/account/incoming-queue
RESPONSE_QUEUE_URL=https://sqs.ap-south-1.amazonaws.com/account/response-queue

# WhatsApp Business API
WHATSAPP_VERIFY_TOKEN=your-verify-token
WHATSAPP_ACCESS_TOKEN=your-access-token
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id

# OpenAI API
OPENAI_API_KEY=your-openai-key

# Billing
BILLING_TEXT_CREDIT=1
BILLING_AUDIO_CREDIT=3
BILLING_IMAGE_CREDIT=2
EOF

# Step 9: Create PM2 configuration
log "Creating PM2 configuration..."
cd "$APP_DIR"
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [
    {
      name: 'chatlogix-api',
      script: 'dist/index.js',
      cwd: '$APP_DIR/backend',
      env: { NODE_ENV: 'production', PORT: 3000 },
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '1G',
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true
    },
    {
      name: 'response-worker',
      script: 'dist/workers/responseWorker.js',
      cwd: '$APP_DIR/backend',
      env: { NODE_ENV: 'production', WORKER_TYPE: 'response' },
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      error_file: './logs/worker-err.log',
      out_file: './logs/worker-out.log',
      log_file: './logs/worker-combined.log',
      time: true
    }
  ]
};
EOF

# Step 10: Create logs directory
mkdir -p "$APP_DIR/backend/logs"

# Step 11: Configure Apache (Bitnami uses Apache instead of Nginx)
log "Configuring Apache..."
sudo cat > /opt/bitnami/apache2/conf/vhosts/chatlogix.conf << EOF
<VirtualHost *:80>
    ServerName $DOMAIN
    ServerAlias api.$DOMAIN
    
    # Frontend
    DocumentRoot $APP_DIR/frontend/dist
    <Directory "$APP_DIR/frontend/dist">
        AllowOverride All
        Require all granted
        
        # Handle React Router
        RewriteEngine On
        RewriteBase /
        RewriteRule ^index\.html$ - [L]
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule . /index.html [L]
    </Directory>
    
    # API Backend Proxy
    ProxyPreserveHost On
    ProxyPass /api/ http://localhost:3000/
    ProxyPassReverse /api/ http://localhost:3000/
    
    # WhatsApp Webhook Proxy
    ProxyPass /webhook/ http://localhost:3000/webhook/
    ProxyPassReverse /webhook/ http://localhost:3000/webhook/
    
    # Health check
    ProxyPass /health http://localhost:3000/health
    ProxyPassReverse /health http://localhost:3000/health
    
    # Security headers
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set X-XSS-Protection "1; mode=block"
    Header always set X-Content-Type-Options "nosniff"
</VirtualHost>
EOF

# Enable the virtual host
sudo ln -sf /opt/bitnami/apache2/conf/vhosts/chatlogix.conf /opt/bitnami/apache2/conf/vhosts/chatlogix-vhost.conf

# Test Apache configuration
sudo /opt/bitnami/apache2/bin/httpd -t

# Step 12: Setup PM2 startup
log "Setting up PM2 startup..."
pm2 startup systemd -u bitnami --hp /home/bitnami || true

# Step 13: Create utility scripts
log "Creating utility scripts..."

# Health check script
cat > health-check.sh << 'EOF'
#!/bin/bash
echo "🔍 ChatLogix Health Check"
echo "========================"
echo "📊 PM2 Status:"
pm2 status
echo ""
echo "🌐 API Health:"
curl -s http://localhost:3000/health || echo "❌ API not responding"
echo ""
echo "💾 System Resources:"
echo "Memory: $(free -h | grep Mem | awk '{print $3 "/" $2}')"
echo "Disk: $(df -h / | tail -1 | awk '{print $3 "/" $2 " (" $5 ")"}')"
echo ""
echo "📋 Recent Logs:"
tail -n 3 backend/logs/combined.log 2>/dev/null || echo "No logs found"
EOF

# Quick deploy script
cat > quick-deploy.sh << 'EOF'
#!/bin/bash
echo "🚀 Quick Deploy Starting..."
git pull origin main
cd backend && npm install --production && npm run build
cd ../frontend && npm install --production && npm run build
cd .. && pm2 restart all
echo "✅ Deploy Complete!"
EOF

# Backup script
cat > backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/home/bitnami/backups"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

echo "📦 Creating backup..."
if [ ! -z "$DATABASE_URL" ]; then
    pg_dump $DATABASE_URL > $BACKUP_DIR/db_$DATE.sql
fi
tar -czf $BACKUP_DIR/app_$DATE.tar.gz backend/logs/ backend/.env
echo "✅ Backup saved to $BACKUP_DIR/"
EOF

chmod +x health-check.sh quick-deploy.sh backup.sh

# Step 14: Setup firewall (if needed)
log "Configuring firewall..."
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw --force enable

log "🎉 Bitnami deployment setup complete!"
echo ""
echo "📋 Next Steps:"
echo "1. Copy .env.template to .env and fill in your values:"
echo "   cd $APP_DIR/backend && cp .env.template .env && nano .env"
echo ""
echo "2. Setup database:"
echo "   npm run prisma:migrate"
echo ""
echo "3. Start the application:"
echo "   cd $APP_DIR && pm2 start ecosystem.config.js"
echo ""
echo "4. Restart Apache:"
echo "   sudo /opt/bitnami/apache2/bin/httpd -k restart"
echo ""
echo "5. Configure SSL (after domain setup):"
echo "   sudo certbot --apache -d $DOMAIN -d api.$DOMAIN"
echo ""
echo "6. Test deployment:"
echo "   ./health-check.sh"
echo ""
echo "🔧 Useful Commands:"
echo "- Quick deploy: ./quick-deploy.sh"
echo "- Health check: ./health-check.sh"
echo "- View logs: pm2 logs"
echo "- Restart: pm2 restart all"
echo "- Apache restart: sudo /opt/bitnami/apache2/bin/httpd -k restart"
echo ""
echo "💰 Estimated Monthly Cost: ~$13-38"
echo "   - Lightsail Instance: $10"
echo "   - PostgreSQL Database: $0 (on instance) or $15-25/month (managed)"
echo "   - SQS + Transfer: ~$3"
