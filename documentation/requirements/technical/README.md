# 🛠️ Technical Requirements - ChatLogix

> System architecture, technical specifications, and implementation details

## 🏗️ System Architecture Overview

ChatLogix follows a **microservices architecture** with **event-driven design** to ensure scalability, maintainability, and high availability for serving millions of users.

### **High-Level Architecture:**
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   WhatsApp     │    │   Web/Mobile    │    │   Admin         │
│   Business API │    │   Dashboard     │    │   Dashboard     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                    API Gateway Layer                           │
│              (Authentication, Rate Limiting, Routing)          │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Core Services Layer                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │
│  │Conversation │ │   Payment   │ │  Shipping   │ │  Analytics  │ │
│  │  Service    │ │  Service    │ │  Service    │ │  Service    │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Data Layer                                  │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │
│  │PostgreSQL   │ │    Redis    │ │     S3      │ │  Elastic    │ │
│  │(Primary DB) │ │  (Cache/Queue)│ │(File Storage)│ │  (Search)   │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Technical Stack Requirements

### **Backend Runtime:**
- **Node.js:** Version 18+ (LTS)
- **TypeScript:** Version 5.2+ with strict mode
- **Runtime:** ES2022+ features support

### **Web Framework:**
- **Express.js:** Version 4.18+ for API development
- **Middleware:** CORS, Helmet, Morgan, compression
- **Validation:** Joi for request validation
- **Rate Limiting:** express-rate-limit + Redis

### **Database & Storage:**
- **Primary Database:** PostgreSQL 15+ with connection pooling
- **Cache:** Redis 7+ for session and data caching
- **Queue:** Bull with Redis for background jobs
- **File Storage:** S3-compatible (AWS S3, MinIO)
- **Search:** Elasticsearch 8+ for advanced search

### **AI & Machine Learning:**
- **OpenAI API:** GPT-4 for intelligent responses
- **Vector Database:** Pinecone or similar for embeddings
- **Model Management:** Custom fine-tuning capabilities

---

## 🗄️ Database Design Requirements

### **Core Tables Structure:**

#### **1. Merchants Table**
```sql
CREATE TABLE merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  business_type VARCHAR(100) NOT NULL,
  address JSONB,
  settings JSONB,
  subscription_plan VARCHAR(50) DEFAULT 'starter',
  subscription_status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### **2. Customers Table**
```sql
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID REFERENCES merchants(id),
  phone_number VARCHAR(20) NOT NULL,
  name VARCHAR(255),
  email VARCHAR(255),
  preferences JSONB,
  consent_status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(merchant_id, phone_number)
);
```

#### **3. Conversations Table**
```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID REFERENCES merchants(id),
  customer_id UUID REFERENCES customers(id),
  whatsapp_conversation_id VARCHAR(255),
  status VARCHAR(50) DEFAULT 'active',
  context JSONB,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  closed_at TIMESTAMP
);
```

#### **4. Messages Table**
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id),
  direction VARCHAR(20) NOT NULL, -- 'inbound' or 'outbound'
  message_type VARCHAR(50) NOT NULL, -- 'text', 'image', 'document'
  content TEXT,
  media_url VARCHAR(500),
  metadata JSONB,
  ai_processed BOOLEAN DEFAULT FALSE,
  intent_classified VARCHAR(100),
  sentiment_score DECIMAL(3,2),
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### **5. Products Table**
```sql
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID REFERENCES merchants(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'INR',
  category VARCHAR(100),
  images JSONB,
  attributes JSONB,
  stock_quantity INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### **6. Orders Table**
```sql
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID REFERENCES merchants(id),
  customer_id UUID REFERENCES customers(id),
  conversation_id UUID REFERENCES conversations(id),
  order_number VARCHAR(50) UNIQUE NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  items JSONB NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  tax_amount DECIMAL(10,2) DEFAULT 0,
  shipping_amount DECIMAL(10,2) DEFAULT 0,
  total_amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'INR',
  shipping_address JSONB,
  billing_address JSONB,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### **7. Payments Table**
```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id),
  payment_method VARCHAR(50) NOT NULL,
  gateway VARCHAR(50) NOT NULL,
  transaction_id VARCHAR(255) UNIQUE,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'INR',
  status VARCHAR(50) DEFAULT 'pending',
  gateway_response JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### **8. Shipments Table**
```sql
CREATE TABLE shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id),
  provider VARCHAR(50) NOT NULL,
  tracking_number VARCHAR(255),
  status VARCHAR(50) DEFAULT 'pending',
  shipping_label_url VARCHAR(500),
  tracking_updates JSONB,
  estimated_delivery TIMESTAMP,
  actual_delivery TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🔌 API Requirements

### **API Design Principles:**
- **RESTful Design:** Follow REST conventions
- **Versioning:** API versioning (v1, v2, etc.)
- **Pagination:** Standard pagination for list endpoints
- **Error Handling:** Consistent error response format
- **Rate Limiting:** Per-merchant rate limiting
- **Authentication:** JWT + API key authentication

### **Core API Endpoints:**

#### **Authentication Endpoints:**
```
POST   /api/v1/auth/register     # Merchant registration
POST   /api/v1/auth/login        # Merchant login
POST   /api/v1/auth/refresh      # Refresh JWT token
POST   /api/v1/auth/logout       # Merchant logout
POST   /api/v1/auth/forgot-password # Password reset
```

#### **Merchant Management:**
```
GET    /api/v1/merchants/profile     # Get merchant profile
PUT    /api/v1/merchants/profile     # Update merchant profile
GET    /api/v1/merchants/settings    # Get merchant settings
PUT    /api/v1/merchants/settings    # Update merchant settings
GET    /api/v1/merchants/analytics  # Get business analytics
```

#### **Customer Management:**
```
GET    /api/v1/customers             # List customers
POST   /api/v1/customers             # Create customer
GET    /api/v1/customers/:id         # Get customer details
PUT    /api/v1/customers/:id         # Update customer
DELETE /api/v1/customers/:id         # Delete customer
```

#### **Conversation Management:**
```
GET    /api/v1/conversations         # List conversations
GET    /api/v1/conversations/:id     # Get conversation
GET    /api/v1/conversations/:id/messages # Get messages
POST   /api/v1/conversations/:id/messages # Send message
PUT    /api/v1/conversations/:id/status   # Update status
```

#### **Product Management:**
```
GET    /api/v1/products              # List products
POST   /api/v1/products              # Create product
GET    /api/v1/products/:id          # Get product details
PUT    /api/v1/products/:id          # Update product
DELETE /api/v1/products/:id          # Delete product
```

#### **Order Management:**
```
GET    /api/v1/orders                # List orders
POST   /api/v1/orders                # Create order
GET    /api/v1/orders/:id            # Get order details
PUT    /api/v1/orders/:id/status     # Update order status
GET    /api/v1/orders/:id/tracking   # Get order tracking
```

#### **Payment Processing:**
```
POST   /api/v1/payments              # Create payment
GET    /api/v1/payments/:id          # Get payment details
POST   /api/v1/payments/:id/capture  # Capture payment
POST   /api/v1/payments/:id/refund   # Process refund
```

#### **Shipping Management:**
```
POST   /api/v1/shipments             # Create shipment
GET    /api/v1/shipments/:id         # Get shipment details
PUT    /api/v1/shipments/:id/status  # Update shipment status
GET    /api/v1/shipments/:id/tracking # Get tracking updates
```

#### **WhatsApp Webhooks:**
```
POST   /api/v1/webhooks/whatsapp     # WhatsApp message webhook
GET    /api/v1/webhooks/whatsapp     # WhatsApp verification
```

---

## 🔐 Security Requirements

### **Authentication & Authorization:**
- **JWT Tokens:** Secure JWT implementation with refresh tokens
- **API Keys:** Merchant-specific API keys for external integrations
- **Role-Based Access Control (RBAC):** Merchant, Admin, Support roles
- **Password Security:** bcrypt with salt rounds 12+
- **Session Management:** Secure session handling with Redis

### **Meta Business Verification:**
- **Business License Verification:** Automated business license validation
- **Address Verification:** Real-time address verification system
- **Phone Number Verification:** Phone number authenticity validation
- **Document Verification:** Business document upload and verification
- **Verification Status Tracking:** Real-time verification progress monitoring

### **Data Protection:**
- **Encryption:** AES-256 encryption for sensitive data
- **PII Protection:** Personal data encryption at rest
- **Data Masking:** Sensitive data masking in logs
- **Audit Logging:** Complete audit trail for all operations

### **API Security:**
- **Rate Limiting:** Per-merchant rate limiting (100 req/min)
- **Input Validation:** Comprehensive input sanitization
- **SQL Injection Prevention:** Parameterized queries only
- **XSS Protection:** Content Security Policy headers
- **CORS Configuration:** Strict CORS policy

### **Infrastructure Security:**
- **HTTPS Only:** TLS 1.3 encryption for all communications
- **Network Security:** VPC isolation and security groups
- **Access Control:** Least privilege access principles
- **Monitoring:** Security event monitoring and alerting

---

## 📊 Performance Requirements

### **Response Time:**
- **API Response:** < 200ms for 95% of requests
- **WhatsApp Response:** < 2 seconds for automated replies
- **Database Queries:** < 100ms for 95% of queries
- **File Upload:** < 5 seconds for 10MB files

### **Throughput:**
- **Concurrent Users:** Support 10,000+ concurrent merchants
- **Messages/Second:** Handle 1,000+ messages per second
- **API Requests:** 100,000+ requests per minute
- **Database Connections:** 1,000+ concurrent connections

### **Scalability:**
- **Horizontal Scaling:** Auto-scaling based on load
- **Database Scaling:** Read replicas and connection pooling
- **Cache Scaling:** Redis cluster for high availability
- **Storage Scaling:** S3-compatible storage with CDN

---

## 🔄 Integration Requirements

### **WhatsApp Business API:**
- **Webhook Handling:** Secure webhook endpoints
- **Message Processing:** Real-time message processing
- **Media Handling:** Image, document, and video support
- **Template Messages:** Pre-approved message templates
- **Status Updates:** Message delivery and read receipts
- **Interactive Messages:** Quick reply buttons, call-to-action buttons
- **Rich Media Messages:** Enhanced media message support
- **Template Analytics:** Message template performance tracking
- **Multi-language Templates:** Support for Indian languages

### **Payment Gateways:**
- **Stripe:** International payment processing
- **Razorpay:** Indian payment methods
- **UPI Integration:** Direct UPI payments
- **Webhook Handling:** Payment status updates
- **Refund Processing:** Automated refund handling

### **Shipping Providers:**
- **Shiprocket:** Indian shipping integration
- **Delhivery:** Logistics and tracking
- **Label Generation:** Automatic shipping labels
- **Tracking Updates:** Real-time shipment status
- **Rate Calculation:** Shipping cost estimation

### **AI Services:**
- **OpenAI GPT-4:** Intelligent response generation
- **Intent Classification:** Customer intent recognition
- **Sentiment Analysis:** Customer mood detection
- **Context Understanding:** Conversation context management
- **Response Validation:** AI response quality control

### **Meta Business Manager Integration:**
- **Business Manager Connection:** Meta Business Manager integration
- **Ad Account Management:** Facebook/Instagram ad account integration
- **Pixel Integration:** Facebook Pixel for conversion tracking
- **Catalog Synchronization:** Product catalog sync with Meta
- **Business Insights:** Meta analytics and business intelligence
- **Ad Campaign Management:** Campaign creation and optimization tools

---

## 🧪 Testing Requirements

### **Testing Strategy:**
- **Unit Testing:** 90%+ code coverage
- **Integration Testing:** API endpoint testing
- **End-to-End Testing:** Complete user journey testing
- **Performance Testing:** Load and stress testing
- **Security Testing:** Penetration testing and vulnerability scans

### **Testing Tools:**
- **Jest:** Unit and integration testing framework
- **Supertest:** API testing library
- **Playwright:** End-to-end testing
- **Artillery:** Performance testing
- **OWASP ZAP:** Security testing

---

## 📈 Monitoring & Observability

### **Application Monitoring:**
- **Prometheus:** Metrics collection
- **Grafana:** Metrics visualization
- **Jaeger:** Distributed tracing
- **Winston:** Structured logging
- **Health Checks:** Service health monitoring

### **Infrastructure Monitoring:**
- **AWS CloudWatch:** Infrastructure metrics
- **ELK Stack:** Log aggregation and analysis
- **Alerting:** Automated alerting for issues
- **Dashboard:** Real-time monitoring dashboards

---

## 🚀 Deployment Requirements

### **Environment Management:**
- **Development:** Local development environment
- **Staging:** Pre-production testing environment
- **Production:** Live production environment
- **CI/CD:** Automated deployment pipeline

### **Infrastructure:**
- **Containerization:** Docker containers for all services
- **Orchestration:** Kubernetes for production deployment
- **Infrastructure as Code:** Terraform for infrastructure management
- **Monitoring:** Comprehensive monitoring and alerting

---

## 📋 Technical Success Criteria

### **Phase 1 Success:**
- ✅ Basic Express server operational
- ✅ Database connection established
- ✅ Basic API endpoints responding
- ✅ Development environment running

### **Phase 2 Success:**
- ✅ Database schema implemented
- ✅ Authentication system working
- ✅ Security measures in place
- ✅ Testing framework operational

### **Phase 3 Success:**
- ✅ WhatsApp integration working
- ✅ Message processing operational
- ✅ Conversation management functional
- ✅ Basic automation working

### **Phase 4 Success:**
- ✅ AI integration operational
- ✅ Smart responses generating
- ✅ Knowledge base functional
- ✅ Response quality high

---

**The technical foundation is solid. The architecture is scalable. The requirements are clear. Let's build ChatLogix! 🚀**

*From requirements to reality - we've got the technical roadmap covered.*
