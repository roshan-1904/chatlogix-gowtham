# 🚀 ChatLogix AWS Lightsail Deployment Options

## 📋 Available Deployment Options

### **Option 1: Direct Node.js Deployment (Recommended)**
- **Best for**: Production environments, full control
- **Pros**: Direct control, easy debugging, cost-effective
- **Cons**: Manual setup, requires server management

### **Option 2: Docker on Lightsail**
- **Best for**: Containerized deployments, easy scaling
- **Pros**: Consistent environments, easy updates
- **Cons**: Slightly more complex, Docker overhead

### **Option 3: Lightsail Containers**
- **Best for**: Serverless-like experience
- **Pros**: Managed containers, auto-scaling
- **Cons**: More expensive, less control

### **Option 4: Lightsail + Load Balancer**
- **Best for**: High availability, multiple instances
- **Pros**: Fault tolerance, load distribution
- **Cons**: Higher cost, more complex setup

## 🎯 Recommended: Direct Node.js Deployment

This is the most cost-effective and straightforward approach for your ChatLogix application.

### **Architecture Overview**
```
Internet → Lightsail Instance → Nginx → Node.js API + Workers
```

### **What You Need**
1. **Lightsail Instance**: Ubuntu 22.04 LTS (2GB RAM minimum)
2. **Database**: PostgreSQL (in-house or managed) - Configure as needed
3. **Domain**: Your custom domain
4. **SSL Certificate**: Let's Encrypt (free)

## 🔧 Step-by-Step Lightsail Deployment

### **Step 1: Create Lightsail Instance**

1. **Go to AWS Lightsail Console**
2. **Create Instance**:
   - **Platform**: Linux/Unix
   - **Blueprint**: Ubuntu 22.04 LTS
   - **Instance Plan**: $10/month (2GB RAM, 1 vCPU, 60GB SSD)
   - **Instance Name**: `chatlogix-production`

### **Step 2: PostgreSQL Database Setup**

**Option 1: Install PostgreSQL on Lightsail Instance**
```bash
# Install PostgreSQL
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

**Option 2: Use Managed PostgreSQL Service**
- AWS RDS PostgreSQL
- DigitalOcean Managed Databases
- Other managed PostgreSQL providers

**Connection String Format:**
- **Local**: `postgresql://chatlogix_user:password@localhost:5432/chatlogix`
- **Remote**: `postgresql://chatlogix_user:password@your-db-host:5432/chatlogix`

### **Step 3: Connect to Instance**

```bash
# Download SSH key from Lightsail console
# Connect to your instance
ssh -i LightsailDefaultKey-ap-south-1.pem ubuntu@your-instance-ip
```

### **Step 4: Run Deployment Script**

```bash
# Upload your deployment script to the instance
# Make it executable and run
chmod +x scripts/deployment/deploy.sh
./scripts/deployment/deploy.sh
```

### **Step 5: Configure Environment**

```bash
# Edit environment file
cd /home/ubuntu/chatlogix/backend
cp .env.template .env
nano .env
```

**Fill in your actual values:**
```bash
# Database (PostgreSQL)
DATABASE_URL=postgresql://chatlogix_user:password@localhost:5432/chatlogix

# AWS SQS Queues
INCOMING_QUEUE_URL=https://sqs.ap-south-1.amazonaws.com/account/incoming-queue
RESPONSE_QUEUE_URL=https://sqs.ap-south-1.amazonaws.com/account/response-queue

# WhatsApp Business API
WHATSAPP_VERIFY_TOKEN=your-verify-token
WHATSAPP_ACCESS_TOKEN=your-access-token
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id

# OpenAI API
OPENAI_API_KEY=your-openai-key
```

### **Step 6: Setup Database**

```bash
cd /home/ubuntu/chatlogix/backend
npm run prisma:migrate
npm run prisma:generate
```

### **Step 7: Start Application**

```bash
cd /home/ubuntu/chatlogix
pm2 start ecosystem.config.js
pm2 save
```

### **Step 8: Configure Domain & SSL**

```bash
# Point your domain to Lightsail instance IP
# Get SSL certificate
sudo certbot --nginx -d yourdomain.com -d api.yourdomain.com
```

## 🔄 Response Worker Explanation

### **How It Works**

1. **Customer sends WhatsApp message** → WhatsApp servers
2. **WhatsApp webhook** → Your API server
3. **API processes message** → Generates AI response
4. **Response queued** → SQS queue
5. **Response worker** → Processes queue
6. **Worker sends response** → WhatsApp API
7. **Customer receives response** → WhatsApp

### **Response Worker Flow**

```javascript
// Simplified flow
while (true) {
  // 1. Poll SQS queue for messages
  const messages = await receiveMessages(RESPONSE_QUEUE_URL);
  
  for (const message of messages) {
    try {
      // 2. Parse message data
      const { to, text, conversationId } = JSON.parse(message.Body);
      
      // 3. Send to WhatsApp
      await sendWhatsAppText(to, text);
      
      // 4. Log to database
      await prisma.message.create({
        data: { conversationId, content: text, senderType: 'system' }
      });
      
      // 5. Delete from queue
      await deleteMessage(RESPONSE_QUEUE_URL, message.ReceiptHandle);
      
    } catch (error) {
      // Handle errors, retry logic
      console.error('Worker error:', error);
    }
  }
}
```

### **Why Use Response Worker?**

1. **Reliability**: Messages are queued, won't be lost
2. **Scalability**: Can run multiple workers
3. **Error Handling**: Failed messages can be retried
4. **Decoupling**: API doesn't wait for WhatsApp response
5. **Monitoring**: Easy to track message processing

## 💰 Cost Breakdown

### **Monthly Costs**
- **Lightsail Instance**: $10 (2GB RAM)
- **PostgreSQL Database**: $0 (on same instance) or $15-25/month (managed)
- **SQS**: ~$1 (1M requests)
- **Data Transfer**: ~$2
- **Total**: ~$13-38/month

### **PostgreSQL Options**
- **On Lightsail Instance**: Included (no extra cost)
- **Managed Service**: $15-25/month (AWS RDS, DigitalOcean, etc.)
- **Perfect for**: Most ChatLogix deployments

## 🚀 Quick Start Commands

```bash
# 1. Connect to Lightsail
ssh -i your-key.pem ubuntu@your-instance-ip

# 2. Clone and setup
git clone https://github.com/your-repo/chatlogix.git
cd chatlogix
chmod +x deploy.sh
./scripts/deployment/deploy.sh

# 3. Configure environment
cd backend
cp .env.template .env
nano .env  # Fill in your values

# 4. Setup database
npm run prisma:migrate

# 5. Start application
cd ..
pm2 start ecosystem.config.js

# 6. Check status
pm2 status
./health-check.sh
```

## 🔧 Maintenance Commands

```bash
# Deploy updates
./scripts/deployment/deploy.sh

# Check health
./health-check.sh

# View logs
pm2 logs

# Restart services
pm2 restart all

# Create backup
./backup.sh
```

## 📊 Monitoring Setup

### **Basic Monitoring**
```bash
# Install monitoring tools
sudo apt install htop iotop nethogs

# Check system resources
htop
df -h
free -h
```

### **Application Monitoring**
```bash
# PM2 monitoring
pm2 monit

# Log monitoring
tail -f backend/logs/combined.log
```

## 🆘 Troubleshooting

### **Common Issues**
1. **Port 3000 not accessible**: Check Lightsail firewall
2. **Database connection failed**: Verify DATABASE_URL
3. **SQS permission denied**: Check AWS credentials
4. **WhatsApp webhook not working**: Verify webhook URL

### **Debug Commands**
```bash
# Check if services are running
pm2 status
sudo systemctl status nginx

# Check logs
pm2 logs chatlogix-api
pm2 logs response-worker
sudo tail -f /var/log/nginx/error.log

# Test API
curl http://localhost:3000/health
```

This approach gives you full control over your deployment while keeping costs low and providing a robust, scalable solution for ChatLogix! 🎉
