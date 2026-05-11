#!/bin/bash

# Quick setup for Nginx reverse proxy
# This script configures Nginx to serve frontend on port 80 and proxy API requests

echo "🔧 ChatLogix Nginx Reverse Proxy Setup"
echo "======================================"

# Check if we're running as bitnami user
if [[ $EUID -eq 0 ]]; then
    echo "❌ Please run this script as bitnami user, not root"
    exit 1
fi

echo "✅ Running as bitnami user"

# Check if nginx is installed
if ! command -v nginx &> /dev/null; then
    echo "🔧 Installing Nginx..."
    sudo apt update
    sudo apt install -y nginx
fi

echo "✅ Nginx is installed"

# Create nginx configuration for ChatLogix
echo "🔧 Creating Nginx configuration..."

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

echo "✅ Nginx configuration created"

# Remove default nginx site
sudo rm -f /etc/nginx/sites-enabled/default

# Enable ChatLogix site
sudo ln -sf "/etc/nginx/sites-available/chatlogix" "/etc/nginx/sites-enabled/"

echo "✅ ChatLogix site enabled"

# Test nginx configuration
echo "🔧 Testing Nginx configuration..."
if sudo nginx -t; then
    echo "✅ Nginx configuration is valid"
    
    # Reload nginx
    sudo systemctl reload nginx
    sudo systemctl enable nginx
    
    echo "✅ Nginx reloaded and enabled"
else
    echo "❌ Nginx configuration test failed"
    exit 1
fi

echo ""
echo "🚀 Nginx reverse proxy setup completed!"
echo ""
echo "📋 Your application is now accessible at:"
echo "   Frontend: http://13.233.92.128/"
echo "   API Docs: http://13.233.92.128/api/docs"
echo "   Health:   http://13.233.92.128/api/health"
echo "   Webhook:  http://13.233.92.128/api/webhook"
echo ""
echo "🔧 Next steps:"
echo "1. Make sure your backend is running: pm2 status"
echo "2. Make sure your frontend is built: ls -la frontend/dist"
echo "3. Test the URLs above"
echo ""
echo "✅ Setup complete!"
