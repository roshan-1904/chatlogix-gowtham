#!/bin/bash

# 🚀 ChatLogix Quick Deployment Script
# For frequent updates without full backup process

set -e

# Configuration
APP_DIR="/home/ubuntu/chatlogix"  # Change this to your actual app directory
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

log "🚀 Quick deployment starting..."

# Pull latest changes
log "Pulling latest changes..."
cd "$APP_DIR"
git pull origin main || git pull origin master

# Install and build backend
log "Building backend..."
cd "$BACKEND_DIR"
npm install --production --silent
npm run build

# Install and build frontend
log "Building frontend..."
cd "$FRONTEND_DIR"
npm install --production --silent
npm run build

# Restart services
log "Restarting services..."
cd "$APP_DIR"
pm2 restart all

log "✅ Quick deployment completed!"
pm2 status
