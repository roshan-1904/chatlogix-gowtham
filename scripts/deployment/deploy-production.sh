#!/bin/bash

# 🚀 ChatLogix Production Deployment Script
# This script handles pulling latest changes, running migrations, building, and restarting services

set -e  # Exit on any error

# Configuration
APP_NAME="chatlogix"
APP_DIR="/home/bitnami/$APP_NAME"  # Bitnami stack directory
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"
LOG_FILE="$APP_DIR/deployment.log"
BACKUP_DIR="/home/bitnami/backups"
NOTIFICATION_WEBHOOK=""  # Optional: Slack/Discord webhook URL
ROLLBACK_ENABLED=true
HEALTH_CHECK_TIMEOUT=60  # seconds
MAX_DEPLOYMENT_TIME=300  # seconds
SSL_ENABLED=false  # Set to true if using HTTPS
DOMAIN_NAME=""  # Your domain name for SSL

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}" | tee -a "$LOG_FILE"
    exit 1
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO: $1${NC}" | tee -a "$LOG_FILE"
}

# Check if running as correct user
if [[ $EUID -eq 0 ]]; then
   error "This script should not be run as root. Please run as bitnami user."
fi

# Check if app directory exists
if [ ! -d "$APP_DIR" ]; then
    error "Application directory $APP_DIR does not exist. Please check the APP_DIR configuration."
fi

# Global variables for rollback
DEPLOYMENT_START_TIME=$(date +%s)
CURRENT_COMMIT=""
PREVIOUS_COMMIT=""
ROLLBACK_COMMIT=""

# Create backup before deployment
create_backup() {
    log "Creating backup before deployment..."
    DATE=$(date +%Y%m%d_%H%M%S)
    
    mkdir -p "$BACKUP_DIR"
    
    # Store current commit for rollback
    cd "$APP_DIR"
    CURRENT_COMMIT=$(git rev-parse HEAD)
    PREVIOUS_COMMIT=$(git rev-parse HEAD~1 2>/dev/null || echo "")
    
    # Backup current build
    if [ -d "$BACKEND_DIR/dist" ]; then
        tar -czf "$BACKUP_DIR/backend_dist_$DATE.tar.gz" -C "$BACKEND_DIR" dist/
        log "Backend build backed up to $BACKUP_DIR/backend_dist_$DATE.tar.gz"
    fi
    
    if [ -d "$FRONTEND_DIR/dist" ]; then
        tar -czf "$BACKUP_DIR/frontend_dist_$DATE.tar.gz" -C "$FRONTEND_DIR" dist/
        log "Frontend build backed up to $BACKUP_DIR/frontend_dist_$DATE.tar.gz"
    fi
    
    # Backup environment file
    if [ -f "$BACKEND_DIR/.env" ]; then
        cp "$BACKEND_DIR/.env" "$BACKUP_DIR/.env_$DATE"
        log "Environment file backed up to $BACKUP_DIR/.env_$DATE"
    fi
    
    # Backup PM2 processes if running
    if command -v pm2 &> /dev/null && pm2 list | grep -q "chatlogix"; then
        pm2 save
        log "PM2 processes backed up"
    fi
    
    # Store backup metadata
    echo "{
        "timestamp": "$(date)",
        "commit": "$CURRENT_COMMIT",
        "previous_commit": "$PREVIOUS_COMMIT",
        "backup_files": [
            "backend_dist_$DATE.tar.gz",
            "frontend_dist_$DATE.tar.gz",
            ".env_$DATE"
        ]
    }" > "$BACKUP_DIR/backup_metadata_$DATE.json"
    
    log "Backup metadata saved to $BACKUP_DIR/backup_metadata_$DATE.json"
}

# Pull latest changes from git
pull_latest_changes() {
    log "Pulling latest changes from git..."
    cd "$APP_DIR"
    
    # Check if git repository exists
    if [ ! -d ".git" ]; then
        error "Git repository not found in $APP_DIR"
    fi
    
    # Stash any local changes
    if ! git diff --quiet; then
        warn "Local changes detected, stashing them..."
        git stash push -m "Auto-stash before deployment $(date)"
    fi
    
    # Pull latest changes
    git fetch origin
    git pull origin main || git pull origin master
    
    log "Latest changes pulled successfully"
    
    # Show commit info
    COMMIT_HASH=$(git rev-parse --short HEAD)
    COMMIT_MSG=$(git log -1 --pretty=format:"%s")
    log "Deploying commit: $COMMIT_HASH - $COMMIT_MSG"
}

# Validate environment variables
validate_environment() {
    log "Validating environment variables..."
    cd "$BACKEND_DIR"
    
    if [ ! -f ".env" ]; then
        error "Environment file .env not found in backend directory"
    fi
    
    # Fix line endings in .env file (convert Windows CRLF to Unix LF)
    log "Fixing line endings in .env file..."
    
    # Method 1: Try dos2unix if available
    if command -v dos2unix &> /dev/null; then
        dos2unix .env
        log "Line endings fixed using dos2unix"
    else
        # Method 2: Use sed to remove carriage returns
        sed -i 's/\r$//' .env
        log "Line endings fixed using sed"
    fi
    
    # Method 3: Additional cleanup - remove any remaining control characters
    sed -i 's/\r//g' .env
    sed -i '/^$/d' .env  # Remove empty lines
    
    # Verify the fix by checking for carriage returns
    if grep -q $'\r' .env; then
        warn "Warning: Some carriage returns may still exist in .env file"
        # Force remove all carriage returns
        tr -d '\r' < .env > .env.tmp && mv .env.tmp .env
        log "Force removed all carriage returns"
    fi
    
    # Source environment variables
    set -a
    source .env
    set +a
    
    # Required environment variables
    REQUIRED_VARS=(
        "DATABASE_URL"
        "REDIS_URL"
        "OPENAI_API_KEY"
        "WHATSAPP_ACCESS_TOKEN"
        "WHATSAPP_PHONE_NUMBER_ID"
        "WHATSAPP_VERIFY_TOKEN"
    )
    
    MISSING_VARS=()
    for var in "${REQUIRED_VARS[@]}"; do
        if [ -z "${!var}" ]; then
            MISSING_VARS+=("$var")
        fi
    done
    
    if [ ${#MISSING_VARS[@]} -ne 0 ]; then
        error "Missing required environment variables: ${MISSING_VARS[*]}"
    fi
    
    log "Environment validation passed"
}

# Install dependencies
install_dependencies() {
    log "Installing backend dependencies..."
    cd "$BACKEND_DIR"
    
    # Check if package.json exists
    if [ ! -f "package.json" ]; then
        error "Backend package.json not found"
    fi
    
    # Install dependencies
    npm ci --silent
    log "Backend dependencies installed"
    
    log "Installing frontend dependencies..."
    cd "$FRONTEND_DIR"
    
    # Check if package.json exists
    if [ ! -f "package.json" ]; then
        error "Frontend package.json not found"
    fi
    
    # Install dependencies
    npm ci --silent
    log "Frontend dependencies installed"
}

# Run database migrations
run_migrations() {
    log "Checking for database migrations..."
    cd "$BACKEND_DIR"
    
    # Check if Prisma is configured
    if [ ! -f "prisma/schema.prisma" ]; then
        warn "Prisma schema not found, skipping migrations"
        return
    fi
    
    # Check if .env exists
    if [ ! -f ".env" ]; then
        warn "Environment file not found, skipping migrations"
        return
    fi
    
    # Generate Prisma client
    log "Generating Prisma client..."
    npm run prisma:generate
    
    # Check for pending migrations
    log "Checking for pending migrations..."
    if npx prisma migrate status 2>/dev/null | grep -q "Following migration have not yet been applied"; then
        log "Running database migrations..."
        npx prisma migrate deploy
        log "Database migrations completed"
    else
        log "No pending migrations found"
    fi
}

# Build applications
build_applications() {
    log "Building backend application..."
    cd "$BACKEND_DIR"
    
    # Clean previous build
    if [ -d "dist" ]; then
        rm -rf dist
        log "Previous backend build cleaned"
    fi
    
    # Build backend
    npm run build
    log "Backend build completed"
    
    log "Building frontend application..."
    cd "$FRONTEND_DIR"
    
    # Clean previous build
    if [ -d "dist" ]; then
        rm -rf dist
        log "Previous frontend build cleaned"
    fi
    
    # Create frontend environment configuration
    log "Creating frontend environment configuration..."
    cat > .env << EOF
VITE_API_URL=http://13.233.92.128
EOF
    log "Frontend environment configured"
    
    # Build frontend
    npm run build
    log "Frontend build completed"
}

# Zero-downtime deployment
zero_downtime_deployment() {
    log "🚀 Starting zero-downtime deployment..."
    
    # Check if PM2 is installed
    if ! command -v pm2 &> /dev/null; then
        error "PM2 not found. Zero-downtime deployment requires PM2."
    fi
    
    # Check if ecosystem config exists
    if [ ! -f "$APP_DIR/ecosystem.config.js" ]; then
        error "PM2 ecosystem.config.js not found"
    fi
    
    # Get current PM2 processes
    local current_processes=$(pm2 list --format json | jq -r '.[] | select(.name | contains("chatlogix")) | .name' 2>/dev/null || echo "")
    
    if [ -z "$current_processes" ]; then
        warn "No existing PM2 processes found. Starting fresh deployment..."
        pm2 start ecosystem.config.js --env production
        return
    fi
    
    log "Current PM2 processes: $current_processes"
    
    # Create backup before zero-downtime deployment
    create_backup
    
    # Pull latest changes
    pull_latest_changes
    
    # Install dependencies
    install_dependencies
    
    # Run migrations
    run_migrations
    
    # Build applications
    build_applications
    
    # Reload PM2 processes (zero-downtime)
    log "Reloading PM2 processes for zero-downtime deployment..."
    pm2 reload ecosystem.config.js --env production
    
    # Wait for processes to be ready
    log "Waiting for processes to be ready..."
    sleep 10
    
    # Perform health check
    health_check
    
    log "✅ Zero-downtime deployment completed successfully!"
}

# Restart services
restart_services() {
    log "Restarting PM2 services..."
    
    # Check if PM2 is installed
    if ! command -v pm2 &> /dev/null; then
        error "PM2 not found. Please install PM2: npm install -g pm2"
    fi
    
    # Check if ecosystem config exists
    if [ ! -f "$APP_DIR/ecosystem.config.js" ]; then
        error "PM2 ecosystem.config.js not found in $APP_DIR"
    fi
    
    # Check if PM2 processes are running
    if pm2 list | grep -q "chatlogix"; then
        log "Restarting existing PM2 processes..."
        pm2 restart ecosystem.config.js --env production
        log "PM2 processes restarted"
    else
        log "Starting PM2 processes..."
        pm2 start ecosystem.config.js --env production
        log "PM2 processes started"
    fi
    
    # Show PM2 status
    info "PM2 Status:"
    pm2 status
    
    # Restart web server if needed
    if command -v nginx &> /dev/null; then
        log "Reloading Nginx configuration..."
        sudo nginx -t && sudo systemctl reload nginx
        log "Nginx reloaded"
    elif command -v apache2 &> /dev/null; then
        log "Reloading Apache configuration..."
        sudo systemctl reload apache2
        log "Apache reloaded"
    fi
}

# Health check
health_check() {
    log "Performing comprehensive health check..."
    
    local health_passed=true
    
    # Check if backend is running
    log "Checking backend health endpoint..."
    local backend_healthy=false
    for i in {1..10}; do
        if curl -s -f http://localhost:3000/health > /dev/null 2>&1; then
            backend_healthy=true
            break
        fi
        log "Backend health check attempt $i/10 failed, retrying..."
        sleep 6
    done
    
    if [ "$backend_healthy" = true ]; then
        log "✅ Backend health check passed"
    else
        warn "❌ Backend health check failed"
        health_passed=false
    fi
    
    # Check database connectivity
    log "Checking database connectivity..."
    cd "$BACKEND_DIR"
    if npx prisma db execute --stdin <<< "SELECT 1;" > /dev/null 2>&1; then
        log "✅ Database connectivity check passed"
    else
        warn "❌ Database connectivity check failed"
        health_passed=false
    fi
    
    # Check Redis connectivity
    log "Checking Redis connectivity..."
    if command -v redis-cli &> /dev/null; then
        if redis-cli ping > /dev/null 2>&1; then
            log "✅ Redis connectivity check passed"
        else
            warn "❌ Redis connectivity check failed"
            health_passed=false
        fi
    fi
    
    # Check process status
    if command -v pm2 &> /dev/null; then
        info "PM2 Process Status:"
        pm2 status
        
        # Check if any PM2 processes are errored
        if pm2 list | grep -q "errored"; then
            warn "❌ Some PM2 processes are in errored state"
            health_passed=false
        fi
    fi
    
    # Check disk space
    DISK_USAGE=$(df -h "$APP_DIR" | tail -1 | awk '{print $5}')
    DISK_USAGE_NUM=$(echo "$DISK_USAGE" | sed 's/%//')
    if [ "$DISK_USAGE_NUM" -gt 90 ]; then
        warn "❌ Disk usage is high: $DISK_USAGE"
        health_passed=false
    else
        info "✅ Disk usage: $DISK_USAGE"
    fi
    
    # Check memory usage
    MEMORY_USAGE=$(free -h | grep Mem | awk '{print $3 "/" $2}')
    info "Memory usage: $MEMORY_USAGE"
    
    # Check load average
    LOAD_AVG=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//')
    info "Load average: $LOAD_AVG"
    
    if [ "$health_passed" = false ]; then
        error "Health check failed. Deployment may have issues."
    fi
    
    log "✅ All health checks passed"
}

# Send notification
send_notification() {
    local status="$1"
    local message="$2"
    
    if [ -n "$NOTIFICATION_WEBHOOK" ]; then
        log "Sending deployment notification..."
        
        local color
        case "$status" in
            "success")
                color="good"
                ;;
            "warning")
                color="warning"
                ;;
            "error")
                color="danger"
                ;;
            *)
                color="good"
                ;;
        esac
        
        local payload="{
            "text": "ChatLogix Deployment $status",
            "attachments": [
                {
                    "color": "$color",
                    "fields": [
                        {
                            "title": "Status",
                            "value": "$status",
                            "short": true
                        },
                        {
                            "title": "Message",
                            "value": "$message",
                            "short": false
                        },
                        {
                            "title": "Commit",
                            "value": "$(cd "$APP_DIR" && git rev-parse --short HEAD)",
                            "short": true
                        },
                        {
                            "title": "Server",
                            "value": "$(hostname)",
                            "short": true
                        }
                    ]
                }
            ]
        }"
        
        curl -X POST -H 'Content-type: application/json' \
             --data "$payload" \
             "$NOTIFICATION_WEBHOOK" 2>/dev/null || warn "Failed to send notification"
    fi
}

# Rollback function
rollback() {
    log "🔄 Starting rollback process..."
    
    if [ "$ROLLBACK_ENABLED" != "true" ]; then
        warn "Rollback is disabled"
        return
    fi
    
    # Find the most recent backup
    local latest_backup=$(find "$BACKUP_DIR" -name "backup_metadata_*.json" -type f -printf '%T@ %p\n' | sort -n | tail -1 | cut -d' ' -f2-)
    
    if [ -z "$latest_backup" ] || [ ! -f "$latest_backup" ]; then
        error "No backup found for rollback"
    fi
    
    log "Using backup: $latest_backup"
    
    # Extract backup timestamp
    local backup_timestamp=$(basename "$latest_backup" | sed 's/backup_metadata_\(.*\)\.json/\1/')
    
    # Restore backend build
    if [ -f "$BACKUP_DIR/backend_dist_$backup_timestamp.tar.gz" ]; then
        log "Restoring backend build..."
        rm -rf "$BACKEND_DIR/dist"
        tar -xzf "$BACKUP_DIR/backend_dist_$backup_timestamp.tar.gz" -C "$BACKEND_DIR"
        log "Backend build restored"
    fi
    
    # Restore frontend build
    if [ -f "$BACKUP_DIR/frontend_dist_$backup_timestamp.tar.gz" ]; then
        log "Restoring frontend build..."
        rm -rf "$FRONTEND_DIR/dist"
        tar -xzf "$BACKUP_DIR/frontend_dist_$backup_timestamp.tar.gz" -C "$FRONTEND_DIR"
        log "Frontend build restored"
    fi
    
    # Restart services
    restart_services
    
    # Perform health check
    health_check
    
    log "✅ Rollback completed successfully"
    send_notification "success" "Rollback completed successfully"
}

# Setup Nginx reverse proxy
setup_nginx() {
    log "Setting up Nginx reverse proxy..."
    
    # Check if nginx is installed
    if ! command -v nginx &> /dev/null; then
        log "Installing Nginx..."
        sudo apt update
        sudo apt install -y nginx
    fi
    
    # Create nginx configuration for ChatLogix
    log "Creating Nginx configuration for ChatLogix..."
    sudo tee "/etc/nginx/sites-available/chatlogix" > /dev/null <<EOF
server {
    listen 80;
    server_name 13.233.92.128 _;
    
    # Frontend - serve static files
    location / {
        root /home/bitnami/chatlogix/frontend/dist;
        try_files \$uri \$uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
    
    # Backend API - proxy to Node.js
    location /api/ {
        proxy_pass http://localhost:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Timeout settings
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # API Documentation - proxy to Node.js
    location /api/docs {
        proxy_pass http://localhost:3000/docs;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
    
    # Health check - proxy to Node.js
    location /api/health {
        proxy_pass http://localhost:3000/health;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # Webhook endpoint - proxy to Node.js
    location /api/webhook {
        proxy_pass http://localhost:3000/webhook;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
    
    # Remove default nginx site
    sudo rm -f /etc/nginx/sites-enabled/default
    
    # Enable ChatLogix site
    sudo ln -sf "/etc/nginx/sites-available/chatlogix" "/etc/nginx/sites-enabled/"
    
    # Test nginx configuration
    log "Testing Nginx configuration..."
    sudo nginx -t
    
    if [ $? -eq 0 ]; then
        # Reload nginx
        sudo systemctl reload nginx
        sudo systemctl enable nginx
        log "✅ Nginx reverse proxy configured successfully"
    else
        error "Nginx configuration test failed"
    fi
}

# Setup SSL/HTTPS
setup_ssl() {
    if [ "$SSL_ENABLED" != "true" ]; then
        log "SSL is disabled, skipping SSL setup"
        return
    fi
    
    if [ -z "$DOMAIN_NAME" ]; then
        warn "SSL is enabled but DOMAIN_NAME is not set. Skipping SSL setup."
        return
    fi
    
    log "Setting up SSL for domain: $DOMAIN_NAME"
    
    # Check if certbot is installed
    if ! command -v certbot &> /dev/null; then
        log "Installing certbot..."
        sudo apt update
        sudo apt install -y certbot python3-certbot-nginx
    fi
    
    # Update nginx configuration for SSL
    log "Updating Nginx configuration for SSL..."
    sudo tee "/etc/nginx/sites-available/chatlogix" > /dev/null <<EOF
server {
    listen 80;
    server_name $DOMAIN_NAME 13.233.92.128 _;
    
    # Redirect all HTTP requests to HTTPS
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN_NAME 13.233.92.128 _;
    
    # SSL configuration will be added by certbot
    
    # Frontend - serve static files
    location / {
        root /home/bitnami/chatlogix/frontend/dist;
        try_files \$uri \$uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
    
    # Backend API - proxy to Node.js
    location /api/ {
        proxy_pass http://localhost:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Timeout settings
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # API Documentation - proxy to Node.js
    location /api/docs {
        proxy_pass http://localhost:3000/docs;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
    
    # Health check - proxy to Node.js
    location /api/health {
        proxy_pass http://localhost:3000/health;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # Webhook endpoint - proxy to Node.js
    location /api/webhook {
        proxy_pass http://localhost:3000/webhook;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
    
    # Test nginx configuration
    sudo nginx -t
    
    # Reload nginx
    sudo systemctl reload nginx
    
    # Get SSL certificate
    log "Obtaining SSL certificate for $DOMAIN_NAME..."
    sudo certbot --nginx -d "$DOMAIN_NAME" --non-interactive --agree-tos --email admin@$DOMAIN_NAME
    
    # Setup auto-renewal
    log "Setting up SSL certificate auto-renewal..."
    (crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet") | crontab -
    
    log "✅ SSL setup completed for $DOMAIN_NAME"
}

# Cleanup old backups
cleanup_old_backups() {
    log "Cleaning up old backups..."
    
    if [ -d "$BACKUP_DIR" ]; then
        # Keep only last 10 backups
        find "$BACKUP_DIR" -name "*.tar.gz" -type f -mtime +7 -delete 2>/dev/null || true
        find "$BACKUP_DIR" -name ".env_*" -type f -mtime +7 -delete 2>/dev/null || true
        find "$BACKUP_DIR" -name "backup_metadata_*.json" -type f -mtime +7 -delete 2>/dev/null || true
        log "Old backups cleaned up"
    fi
}

# Main deployment function
main() {
    log "🚀 Starting ChatLogix deployment..."
    
    # Create log file
    mkdir -p "$(dirname "$LOG_FILE")"
    echo "=== ChatLogix Deployment Started at $(date) ===" > "$LOG_FILE"
    
    # Send start notification
    send_notification "info" "Deployment started"
    
    # Set up error handling
    set -e
    trap 'handle_deployment_error' ERR
    
    # Run deployment steps
    create_backup
    validate_environment
    pull_latest_changes
    install_dependencies
    run_migrations
    build_applications
    setup_nginx
    restart_services
    health_check
    cleanup_old_backups
    
    # Calculate deployment time
    DEPLOYMENT_END_TIME=$(date +%s)
    DEPLOYMENT_DURATION=$((DEPLOYMENT_END_TIME - DEPLOYMENT_START_TIME))
    
    log "🎉 Deployment completed successfully in ${DEPLOYMENT_DURATION} seconds!"
    
    # Send success notification
    send_notification "success" "Deployment completed successfully in ${DEPLOYMENT_DURATION} seconds"
    
    # Show deployment summary
    echo ""
    info "📋 Deployment Summary:"
    info "- Application: ChatLogix"
    info "- Directory: $APP_DIR"
    info "- Commit: $(cd "$APP_DIR" && git rev-parse --short HEAD)"
    info "- Duration: ${DEPLOYMENT_DURATION} seconds"
    info "- Log file: $LOG_FILE"
    info "- Backup directory: $BACKUP_DIR"
    info "- Deployment mode: $DEPLOYMENT_MODE"
    
    echo ""
    info "🔧 Useful Commands:"
    info "- View logs: pm2 logs"
    info "- Check status: pm2 status"
    info "- Restart services: pm2 restart all"
    info "- View deployment log: tail -f $LOG_FILE"
    info "- Rollback: $0 --rollback"
    
    echo ""
    log "✅ Deployment script completed successfully!"
}

# Error handling function
handle_deployment_error() {
    local exit_code=$?
    log "❌ Deployment failed with exit code $exit_code"
    
    # Send error notification
    send_notification "error" "Deployment failed with exit code $exit_code"
    
    # Ask if user wants to rollback
    if [ "$ROLLBACK_ENABLED" = "true" ]; then
        echo ""
        warn "Deployment failed. Would you like to rollback? (y/N)"
        read -r -t 30 response
        if [[ "$response" =~ ^[Yy]$ ]]; then
            rollback
        else
            warn "Rollback skipped. Manual intervention may be required."
        fi
    fi
    
    exit $exit_code
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "ChatLogix Deployment Script"
        echo ""
        echo "Usage: $0 [options]"
        echo ""
        echo "Options:"
        echo "  --help, -h     Show this help message"
        echo "  --dry-run      Show what would be done without executing"
        echo "  --backup-only  Only create backup"
        echo "  --build-only   Only build applications (skip git pull)"
        echo "  --rollback     Rollback to previous deployment"
        echo "  --zero-downtime Zero-downtime deployment (PM2 reload)"
        echo "  --nginx-setup  Setup Nginx reverse proxy"
        echo "  --ssl-setup    Setup SSL/HTTPS with Let's Encrypt"
        echo ""
        echo "This script will:"
        echo "1. Create backup of current build"
        echo "2. Validate environment variables"
        echo "3. Pull latest changes from git"
        echo "4. Install dependencies"
        echo "5. Run database migrations"
        echo "6. Build frontend and backend"
        echo "7. Restart PM2 services"
        echo "8. Perform comprehensive health check"
        echo "9. Send deployment notifications"
        echo "Zero-downtime deployment (--zero-downtime):"
        echo "- Uses PM2 reload instead of restart"
        echo "- Maintains service availability during deployment"
        echo "- Recommended for production environments"
        echo ""
        echo "Configuration:"
        echo "- APP_DIR: $APP_DIR"
        echo "- ROLLBACK_ENABLED: $ROLLBACK_ENABLED"
        echo "- HEALTH_CHECK_TIMEOUT: ${HEALTH_CHECK_TIMEOUT}s"
        echo "- MAX_DEPLOYMENT_TIME: ${MAX_DEPLOYMENT_TIME}s"
        exit 0
        ;;
    --dry-run)
        log "DRY RUN MODE - No changes will be made"
        log "Would execute: create_backup, pull_latest_changes, install_dependencies, run_migrations, build_applications, restart_services, health_check, cleanup_old_backups"
        exit 0
        ;;
    --backup-only)
        log "BACKUP ONLY MODE"
        create_backup
        log "Backup completed"
        exit 0
        ;;
    --build-only)
        log "BUILD ONLY MODE"
        validate_environment
        install_dependencies
        run_migrations
        build_applications
        restart_services
        health_check
        log "Build completed"
        exit 0
        ;;
    --rollback)
        log "ROLLBACK MODE"
        rollback
        exit 0
        ;;
    --ssl-setup)
        log "SSL SETUP MODE"
        setup_ssl
        exit 0
        ;;
    --nginx-setup)
        log "NGINX SETUP MODE"
        setup_nginx
        exit 0
        ;;
    "")
        main
        ;;
    *)
        error "Unknown option: $1. Use --help for usage information."
        ;;
esac
