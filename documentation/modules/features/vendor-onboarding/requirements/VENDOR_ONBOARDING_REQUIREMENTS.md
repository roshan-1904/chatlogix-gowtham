# Vendor Onboarding - Detailed Requirements Document

**Version:** 1.0  
**Date:** December 2024  
**Status:** Planning Phase  
**Priority:** High - Backbone of Business Operations

---

## 📋 Executive Summary

This document outlines the comprehensive requirements for implementing an automated vendor onboarding system for ChatLogix. The system aims to minimize manual work and enable vendors to self-onboard with minimal friction, while ensuring all necessary data is collected and configured automatically.

**Key Goals:**
- **90%+ automation** - Minimal manual intervention required
- **30-minute onboarding** - Complete process in under 30 minutes
- **Zero manual data entry** - Auto-extract and configure from documents
- **Admin approval workflow** - Quality control before going live
- **WhatsApp integration** - Seamless connection to WhatsApp Business API

---

## 🎯 Business Objectives

### Primary Goals
1. **Automate Vendor Onboarding** - Reduce manual setup time from hours to minutes
2. **Self-Service Capability** - Vendors can onboard without support team assistance
3. **Data Quality** - Ensure all vendor data is complete and accurate
4. **WhatsApp Integration** - Automatically connect vendors to WhatsApp Business API
5. **Scalability** - Handle hundreds of vendor onboardings simultaneously

### Success Metrics
- **Onboarding Completion Rate:** >80%
- **Average Time to Complete:** <30 minutes
- **Document Processing Accuracy:** >90%
- **Admin Approval Time:** <24 hours
- **Vendor Satisfaction Score:** >4.5/5
- **Automation Rate:** >90% (minimal manual work)

---

## 👥 User Personas

### 1. Micro Seller (MS)
- **Profile:** Home baker, tailor, craft seller
- **Tech Literacy:** Limited
- **Documents:** May not have GST/PAN ready
- **Needs:** Simple, guided process with help text

### 2. SMB Owner (SMB)
- **Profile:** Small shop owner with GST, email, basic digital literacy
- **Tech Literacy:** Moderate
- **Documents:** Has business documents ready
- **Needs:** Fast, efficient process

### 3. Operations Agent (Ops)
- **Profile:** Internal staff assisting vendors
- **Role:** Review and approve vendor submissions
- **Needs:** Clear dashboard with all vendor information

### 4. Platform Admin
- **Profile:** Manages platform, reviews verification events
- **Role:** Final approval and quality control
- **Needs:** Comprehensive review tools and audit trail

---

## 🔄 Onboarding Flow Overview

```
1. Basic Information → 2. Phone Verification → 3. Document Upload → 
4. Data Processing → 5. Demo Chat → 6. WhatsApp Setup → 7. Admin Approval → 8. Go Live
```

**Total Steps:** 7 (excluding admin approval)  
**Estimated Time:** 20-30 minutes  
**Automation Level:** 90%+

---

## 📝 Detailed Feature Requirements

### Phase 1: Database Schema Updates

#### New Models/Tables Required

**1. VendorOnboarding**
```prisma
model VendorOnboarding {
  id                    String   @id @default(uuid())
  vendorId              String   @unique
  status                String   @default("not_started") // not_started, in_progress, pending_approval, approved, rejected
  currentStep           Int      @default(1) // 1-7
  startedAt             DateTime @default(now())
  completedAt           DateTime?
  submittedAt           DateTime?
  approvedAt            DateTime?
  approvedBy            String?
  rejectionReason       String?  @db.Text
  
  // Extracted/Processed Data
  extractedProducts     Json?   // Products extracted from documents
  extractedBusinessInfo Json?   // Business details extracted
  generatedPrompts       Json?   // AI-generated prompts
  
  // WhatsApp Integration Status
  whatsappBusinessAccountId String?
  whatsappPhoneNumberStatus  String? // pending, verified, active
  whatsappPhoneNumberId      String?
  whatsappWabaId             String?
  
  // Documents
  documents            OnboardingDocument[]
  
  vendor               Vendor   @relation(fields: [vendorId], references: [id], onDelete: Cascade)
  
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt
  
  @@map("VendorOnboarding")
}
```

**2. OnboardingDocument**
```prisma
model OnboardingDocument {
  id                String   @id @default(uuid())
  onboardingId      String
  documentType      String   // csv, brochure, pdf, image
  fileName          String
  fileSize          Int      // bytes
  s3Key             String   // S3 object key
  s3Url             String?  // Presigned URL (temporary)
  mimeType          String
  
  // Processing Status
  processingStatus  String   @default("pending") // pending, processing, completed, failed
  extractedData     Json?    // Extracted data from document
  processingError   String?  @db.Text
  
  uploadedAt        DateTime @default(now())
  processedAt       DateTime?
  
  onboarding        VendorOnboarding @relation(fields: [onboardingId], references: [id], onDelete: Cascade)
  
  @@map("OnboardingDocument")
}
```

**3. OnboardingStep**
```prisma
model OnboardingStep {
  id                String   @id @default(uuid())
  onboardingId      String
  stepNumber        Int      // 1-7
  stepName          String   // basic_info, phone_verify, document_upload, etc.
  status            String   @default("pending") // pending, in_progress, completed, skipped
  stepData          Json?    // Step-specific data
  completedAt       DateTime?
  
  onboarding        VendorOnboarding @relation(fields: [onboardingId], references: [id], onDelete: Cascade)
  
  @@unique([onboardingId, stepNumber])
  @@map("OnboardingStep")
}
```

#### Updates to Existing Vendor Model
```prisma
// Add to Vendor model:
onboardingStatus        String   @default("not_started")
onboardingData          Json?    // Store extracted/processed data
whatsappBusinessAccountId String?
whatsappPhoneNumberStatus  String?
```

---

### Phase 2: Multi-Step Onboarding UI Flow

#### Step 1: Basic Information Collection

**Fields:**
- Business Name (required, text input)
- Owner Name (required, text input)
- Email (required, email validation)
- Business Category (required, dropdown):
  - Food & Beverages
  - Retail & E-commerce
  - Services
  - Healthcare
  - Education
  - Other
- Business Address (optional, textarea)
- Preferred Language (required, dropdown):
  - English
  - Hindi
  - Tamil
  - Telugu
  - Other

**UI Requirements:**
- Clean, simple form layout
- Real-time validation
- Progress indicator (Step 1 of 7)
- Help tooltips for each field
- Mobile-responsive design
- "Save & Continue" button

**Validation Rules:**
- Email: Valid email format, not already registered
- Business Name: 3-100 characters
- Owner Name: 2-50 characters
- All required fields must be filled

---

#### Step 2: Phone Number OTP Verification

**Flow:**
1. Display phone input with country code selector
2. User enters phone number
3. Click "Send OTP" button
4. OTP sent via Firebase (reuse existing `/auth/send-code`)
5. User enters OTP code
6. Verify OTP (reuse existing `/auth/verify-code`)
7. Auto-advance to next step on success

**UI Requirements:**
- Country code dropdown (default: +91 India)
- Phone number input (validated format)
- OTP input field (6 digits)
- "Send OTP" button
- "Resend OTP" option (after 60 seconds)
- Countdown timer for resend
- Error messages for invalid OTP
- Progress indicator (Step 2 of 7)

**Validation:**
- Phone number: Valid E.164 format
- OTP: 6 digits, expires in 2 minutes
- Maximum 3 verification attempts

**Backend Integration:**
- Reuse existing `/auth/send-code` endpoint
- Reuse existing `/auth/verify-code` endpoint
- Link verified phone to vendor record

---

#### Step 3: Document Upload

**Upload Options:**
1. **CSV File** (Products Catalog)
   - Format: name, price, description, category, keywords, etc.
   - Max size: 5MB
   - Accepted formats: .csv

2. **Brochure/Pamphlet** (PDF or Images)
   - Max size: 10MB
   - Accepted formats: .pdf, .jpg, .jpeg, .png
   - Multiple files allowed

3. **Skip** (Manual entry later)
   - Allow vendor to skip and add products manually later

**UI Requirements:**
- Drag-and-drop file upload area
- File picker button
- File preview (thumbnails for images)
- Upload progress bar
- File list with remove option
- Format validation before upload
- File size validation
- Help text with example formats

**Features:**
- Multiple file upload support
- File type validation
- File size limits enforced
- Upload progress tracking
- Error handling for failed uploads
- Retry option for failed uploads

**Backend Requirements:**
- Upload to S3 with encryption
- Generate presigned URLs for upload
- Store file metadata in database
- Queue document processing job
- Return document ID immediately

---

#### Step 4: Data Processing & Review

**Processing Flow:**
1. Show processing status (spinner/loading)
2. Process documents in background:
   - CSV: Parse and extract products
   - Brochure/PDF: OCR + AI extraction
3. Display extracted data:
   - Products list (name, price, description)
   - Business information
   - Auto-generated prompts preview
4. Allow vendor to edit extracted data
5. Show defaults applied (highlighted)

**Extracted Data Display:**
- **Products Section:**
  - Table view: Name, Price, Description, Category
  - Edit inline capability
  - Add/Remove products
  - Bulk import validation

- **Business Information:**
  - Address (editable)
  - Contact details
  - Business hours (if extracted)

- **AI Prompts Preview:**
  - System prompt preview
  - Product information section
  - Delivery instructions
  - Greeting message
  - Closing message

- **Default Values Applied:**
  - Timezone: Asia/Kolkata
  - Order prefix: Auto-generated
  - Minimum order value: None
  - Preparation time: 30 minutes
  - Notification settings: Enabled

**UI Requirements:**
- Processing status indicator
- Extracted data cards/sections
- Edit buttons for each section
- "Looks Good" button to proceed
- "Edit" button to modify data
- Progress indicator (Step 4 of 7)

**Validation:**
- At least 1 product required (or skip)
- Valid price formats
- Required product fields filled

---

#### Step 5: Interactive Demo Chat

**Purpose:**
- Verify all vendor details are correct
- Show how AI will respond to customers
- Provide overview and summary
- Answer basic questions

**Chat Features:**
- Embedded chat widget (WhatsApp-like UI)
- Pre-configured with vendor's data
- Real-time AI responses
- Sample questions provided:
  - "Hi, what do you sell?"
  - "What are your prices?"
  - "I want to order [product name]"
  - "What's your address?"
  - "How do I place an order?"

**Summary Panel:**
- Shows extracted order details (if demo order placed)
- Product matching accuracy
- Response quality indicators
- Conversation flow preview

**UI Requirements:**
- Chat interface similar to WhatsApp
- Message bubbles (customer/AI)
- Input field for custom questions
- Sample questions buttons
- Summary panel (collapsible)
- "Continue" button to proceed
- "Edit Details" button to go back

**Backend Requirements:**
- Create temporary conversation for demo
- Use vendor's extracted data for AI responses
- Process demo messages through multi-stage AI
- Return summary after demo

**Demo Data:**
- Use vendor's products
- Use vendor's prompts
- Simulate customer interactions
- Show order extraction capability

---

#### Step 6: WhatsApp Integration Setup

**Two Options:**

**Option 1: Self-Serve (Recommended)**
- Guided step-by-step instructions
- Meta Business Account setup guide
- Phone number registration
- Webhook configuration (auto-handled)
- Template submission
- Test message sending

**Option 2: Assisted**
- Schedule 15-minute call with support
- Support team handles setup
- Vendor receives notification when ready

**Self-Serve Flow:**
1. **Business Verification:**
   - Instructions for Meta Business Account creation
   - Document upload for verification
   - Status tracking

2. **Phone Number Registration:**
   - Enter WhatsApp Business phone number
   - Check if number is on personal WhatsApp
   - Migration guide if needed
   - Verification code process

3. **Webhook Configuration:**
   - Auto-configure webhook URL
   - Verify token setup
   - Test webhook connection

4. **Template Submission:**
   - Pre-approved templates:
     - Welcome message
     - Order confirmation
     - Order status update
   - Submit templates via API
   - Track approval status

5. **Test Message:**
   - Send test message to vendor's phone
   - Verify receipt
   - Confirm integration working

**UI Requirements:**
- Step-by-step instructions
- Progress checklist
- Status indicators for each step
- "Test WhatsApp" button
- "Skip for Now" option (can complete later)
- Help links and documentation
- Support contact option

**Backend Requirements:**
- Meta Business API integration
- Phone number validation
- Webhook auto-configuration
- Template submission API
- Test message sending
- Status tracking

---

#### Step 7: Summary & Submission

**Summary Display:**
- Complete overview of all entered data:
  - Basic information
  - Phone number (masked)
  - Products count
  - Business details
  - WhatsApp status
- Review all sections
- Edit option for each section

**Terms & Conditions:**
- Service agreement checkbox
- Privacy policy acceptance
- Terms of service acceptance
- Required to proceed

**Submission:**
- "Submit for Approval" button
- Confirmation dialog
- Status change to "Pending Admin Approval"
- Success message with next steps
- Email notification sent

**UI Requirements:**
- Summary cards for each section
- Edit links for each section
- Terms checkboxes
- Submit button (disabled until terms accepted)
- Confirmation modal
- Success screen with status

**Post-Submission:**
- Show "Pending Approval" status
- Estimated approval time (24 hours)
- Contact information for questions
- Email confirmation sent

---

### Phase 3: Backend API Endpoints

#### Onboarding Routes (`/api/v1/onboarding`)

**1. POST `/api/v1/onboarding/start`**
- Create new onboarding session
- Initialize vendor record
- Set status to "in_progress"
- Return onboarding ID and current step

**Request:**
```json
{
  "businessName": "Example Business",
  "email": "vendor@example.com"
}
```

**Response:**
```json
{
  "onboardingId": "uuid",
  "vendorId": "uuid",
  "currentStep": 1,
  "status": "in_progress"
}
```

---

**2. POST `/api/v1/onboarding/basic-info`**
- Save basic information
- Validate email format
- Check email uniqueness
- Update onboarding step

**Request:**
```json
{
  "onboardingId": "uuid",
  "businessName": "Example Business",
  "ownerName": "John Doe",
  "email": "vendor@example.com",
  "category": "food",
  "address": "123 Main St",
  "language": "en"
}
```

**Response:**
```json
{
  "success": true,
  "currentStep": 2
}
```

---

**3. POST `/api/v1/onboarding/verify-phone`**
- Reuse existing `/auth/send-code` and `/auth/verify-code`
- Link verified phone to vendor record
- Update onboarding step

**Request:**
```json
{
  "onboardingId": "uuid",
  "phoneNumber": "+919876543210",
  "sessionInfo": "session_info_from_auth",
  "code": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "phoneVerified": true,
  "currentStep": 3
}
```

---

**4. POST `/api/v1/onboarding/upload-document`**
- Generate presigned URL for S3 upload
- Create document record
- Queue processing job
- Return document ID

**Request:**
```json
{
  "onboardingId": "uuid",
  "documentType": "csv",
  "fileName": "products.csv",
  "fileSize": 1024000,
  "mimeType": "text/csv"
}
```

**Response:**
```json
{
  "documentId": "uuid",
  "uploadUrl": "https://s3.amazonaws.com/...",
  "expiresIn": 3600
}
```

---

**5. GET `/api/v1/onboarding/processing-status/:documentId`**
- Check document processing status
- Return extracted data when ready
- Show processing errors if any

**Response:**
```json
{
  "status": "completed",
  "extractedData": {
    "products": [...],
    "businessInfo": {...}
  },
  "processingError": null
}
```

---

**6. POST `/api/v1/onboarding/process-document`**
- Background job to process documents
- CSV parsing
- OCR + AI extraction for brochures
- Generate AI prompts
- Update onboarding data

**Processing Logic:**
- CSV: Parse using papaparse, validate, normalize
- PDF/Images: OCR (Tesseract/AWS Textract) + GPT-4 Vision
- Extract: Products, business info, address, contact
- Generate: System prompts, product info, delivery instructions

---

**7. POST `/api/v1/onboarding/update-extracted-data`**
- Allow vendor to edit extracted data
- Validate edited data
- Update onboarding data

**Request:**
```json
{
  "onboardingId": "uuid",
  "products": [...],
  "businessInfo": {...},
  "prompts": {...}
}
```

---

**8. POST `/api/v1/onboarding/demo-chat/message`**
- Create temporary conversation for demo
- Process message through multi-stage AI
- Return AI response

**Request:**
```json
{
  "onboardingId": "uuid",
  "message": "What products do you have?"
}
```

**Response:**
```json
{
  "response": "We have the following products...",
  "extractedData": {...}
}
```

---

**9. GET `/api/v1/onboarding/demo-chat/summary`**
- Get demo chat summary
- Show conversation flow
- Display extracted data

---

**10. POST `/api/v1/onboarding/whatsapp-setup`**
- Initiate WhatsApp Business Account setup
- Register phone number
- Configure webhook
- Submit templates
- Return status

**Request:**
```json
{
  "onboardingId": "uuid",
  "phoneNumber": "+919876543210",
  "businessAccountId": "meta_business_id"
}
```

---

**11. POST `/api/v1/onboarding/submit`**
- Final submission
- Validate all required data
- Set status to "pending_approval"
- Notify admins
- Send confirmation email

**Request:**
```json
{
  "onboardingId": "uuid",
  "termsAccepted": true
}
```

---

**12. GET `/api/v1/onboarding/status`**
- Get current onboarding status
- Return current step
- Return saved data
- Allow resume from last step

**Response:**
```json
{
  "onboardingId": "uuid",
  "status": "in_progress",
  "currentStep": 4,
  "data": {...}
}
```

---

### Phase 4: Document Processing Service

#### CSV Processing

**Parser:** papaparse library

**Expected Format:**
```csv
name,price,description,category,keywords,unit,quantity
Product 1,100,Description 1,food,"keyword1,keyword2",kg,1
Product 2,200,Description 2,food,"keyword3,keyword4",piece,1
```

**Processing Steps:**
1. Parse CSV file
2. Validate required columns (name, price)
3. Normalize data:
   - Convert price to paise (multiply by 100)
   - Validate price format
   - Normalize category names
   - Parse keywords (comma-separated)
4. Create Product records
5. Handle errors gracefully (skip invalid rows, log errors)

**Output:**
```json
{
  "products": [
    {
      "name": "Product 1",
      "basePrice": 10000,
      "description": "Description 1",
      "category": "food",
      "keywords": ["keyword1", "keyword2"],
      "baseUnit": "kg",
      "baseQuantity": 1
    }
  ],
  "errors": [],
  "totalProcessed": 10,
  "totalFailed": 0
}
```

---

#### Brochure/PDF Processing

**OCR Options:**
1. **AWS Textract** (Recommended)
   - Better accuracy
   - Handles multiple languages
   - Structured data extraction

2. **Tesseract.js** (Fallback)
   - Open source
   - Good for English
   - Lower accuracy

**AI Extraction:**
- Use GPT-4 Vision or GPT-4o for image analysis
- Extract:
  - Product names and prices
  - Business address
  - Contact information
  - Business hours
  - Product descriptions

**Processing Flow:**
1. Upload document to S3
2. Extract text using OCR
3. Analyze with AI (GPT-4 Vision)
4. Extract structured data:
   - Products (name, price, description)
   - Business info (address, phone, email)
   - Other relevant information
5. Generate structured JSON output
6. Create Product records

**Prompt for AI Extraction:**
```
Analyze this business brochure/image and extract:
1. Product names with prices
2. Business address
3. Contact information
4. Business hours (if mentioned)
5. Product descriptions

Return structured JSON format.
```

---

#### AI Prompt Generation

**Auto-Generate:**
1. **System Prompt:**
   - Business name and personality
   - Product information section
   - Delivery instructions
   - Address information
   - Tone examples

2. **Product Information:**
   - List all products with prices
   - Product descriptions
   - Categories

3. **Delivery Instructions:**
   - Default delivery instructions
   - Pickup address
   - Delivery areas (if specified)

4. **Greeting Message:**
   - Welcome message
   - Business introduction

5. **Closing Message:**
   - Thank you message
   - Contact information

**Default Values:**
- Timezone: "Asia/Kolkata"
- Order prefix: Auto-generate from business name (5 letters)
- Minimum order value: null (no minimum)
- Category: From form or "general"
- AI model: "gpt-4o-mini"
- Preparation time: 30 minutes
- Delivery instructions: Standard template
- Notification settings: Default enabled

**Prompt Template:**
```
You are {aiBotName}, the friendly AI assistant for {businessName}.

BUSINESS INFORMATION:
- Business Name: {businessName}
- Category: {category}
- Address: {address}

AVAILABLE PRODUCTS:
{products_list}

DELIVERY INSTRUCTIONS:
{delivery_instructions}

ADDRESS:
{pickup_delivery_address}

TONE EXAMPLE:
{tone_example}

[Rest of system prompt...]
```

---

### Phase 5: Interactive Demo Chat

#### Implementation Details

**Temporary Conversation:**
- Create demo conversation in database
- Use vendor's extracted data
- Process through multi-stage AI system
- Clean up after demo (optional)

**Chat Features:**
- Real-time messaging
- AI responses using vendor's data
- Product matching demonstration
- Order extraction demonstration
- Natural conversation flow

**Sample Questions:**
- "Hi, what do you sell?"
- "What are your prices?"
- "I want to order [product name]"
- "What's your address?"
- "How do I place an order?"
- "Do you deliver?"
- "What's your minimum order?"

**Summary Panel:**
- Extracted order details (if demo order placed)
- Product matching accuracy
- Response quality indicators
- Conversation flow preview
- Key insights

**Backend Implementation:**
- Use existing multi-stage AI processing
- Create temporary vendor record
- Use extracted products and prompts
- Process messages normally
- Return responses and summary

---

### Phase 6: WhatsApp API Integration

#### Meta Cloud API Integration

**Business Verification:**
1. Collect business documents
2. Submit via Meta Business API
3. Track verification status
4. Handle rejection cases

**Phone Number Registration:**
1. Validate phone format (E.164)
2. Check if number is on personal WhatsApp
3. Migration flow if needed:
   - Request migration code
   - Vendor confirms on phone
   - Complete migration
4. Register via Cloud API
5. Request verification code
6. Verify phone number

**Webhook Setup:**
1. Auto-configure webhook URL
2. Set verify token
3. Subscribe to events:
   - messages
   - message_status
   - message_template_status_update
4. Test webhook connection

**Template Submission:**
1. Pre-approved templates:
   - Welcome message
   - Order confirmation
   - Order status update
2. Submit via API
3. Track approval status
4. Handle rejection cases

**Test Message:**
1. Send test message to vendor's phone
2. Verify receipt
3. Confirm integration working

**API Endpoints:**
- `POST /api/v1/whatsapp/register-business`
- `POST /api/v1/whatsapp/register-phone`
- `GET /api/v1/whatsapp/verification-status`
- `POST /api/v1/whatsapp/send-test-message`
- `POST /api/v1/whatsapp/submit-template`

---

### Phase 7: Admin Approval Workflow

#### Admin Dashboard

**Vendor List:**
- Show all vendors pending approval
- Filter by:
  - Status
  - Category
  - Submission date
  - Business name
- Sort options
- Pagination

**Vendor Details View:**
- Complete onboarding data
- Extracted products
- Business information
- Generated prompts
- WhatsApp status
- Documents (downloadable)
- Demo chat history

**Review Actions:**
- Approve vendor
- Reject vendor (with reason)
- Request changes (send back to vendor)
- Add notes/comments

**Approval Process:**
1. Admin reviews vendor submission
2. Checks data completeness
3. Reviews extracted products
4. Tests demo chat (optional)
5. Approves or rejects
6. Vendor notified via email

**Post-Approval:**
- Set `onboardingStatus: "approved"`
- Activate vendor account
- Enable dashboard access
- Send welcome email/SMS
- Enable WhatsApp integration
- Grant API access

**Rejection Process:**
1. Admin selects rejection reason
2. Adds comments (optional)
3. Vendor notified
4. Vendor can resubmit after corrections

**API Endpoints:**
- `GET /api/v1/admin/onboarding/pending`
- `GET /api/v1/admin/onboarding/:vendorId`
- `POST /api/v1/admin/onboarding/:vendorId/approve`
- `POST /api/v1/admin/onboarding/:vendorId/reject`
- `POST /api/v1/admin/onboarding/:vendorId/request-changes`

---

### Phase 8: File Upload & Storage

#### S3 Bucket Structure

```
onboarding-documents/
  {vendorId}/
    {documentId}/
      original.{ext}
      processed.json (if applicable)
      thumbnails/ (for images)
        thumb.{ext}
```

#### Upload Service

**Features:**
- Generate presigned URLs for upload
- Validate file types and sizes
- Encrypt sensitive documents
- Store metadata in database
- Generate thumbnails for images

**File Validation:**
- CSV: Max 5MB, .csv only
- Images: Max 10MB, .jpg, .jpeg, .png
- PDF: Max 10MB, .pdf only

**Security:**
- Encrypt files at rest
- Presigned URLs expire in 1 hour
- Access control via IAM
- Audit logging

---

### Phase 9: Error Handling & Validation

#### Validation Rules

**Email:**
- Valid email format
- Not already registered
- Domain validation (optional)

**Phone Number:**
- E.164 format
- Valid country code
- Not already registered

**File Upload:**
- File size limits enforced
- File type validation
- File content validation (for CSV)

**Required Fields:**
- Business name
- Owner name
- Email
- Phone number
- Category
- Language

#### Error Messages

**User-Friendly Messages:**
- Clear, actionable error messages
- Retry options where applicable
- Support contact information
- Progress saved (can resume later)

**Error Types:**
- Validation errors (field-level)
- Processing errors (document processing)
- API errors (WhatsApp, external APIs)
- System errors (database, S3)

**Error Handling:**
- Log all errors
- Notify support team for critical errors
- Allow vendor to retry
- Save progress on errors

---

### Phase 10: UI/UX Design Requirements

#### Design Principles

1. **Simplicity:** Clean, uncluttered interface
2. **Guidance:** Clear instructions at each step
3. **Progress:** Visual progress indicators
4. **Feedback:** Immediate feedback on actions
5. **Mobile-First:** Responsive design
6. **Accessibility:** WCAG 2.1 AA compliance

#### Components Needed

1. **Multi-Step Form Wizard**
   - Step indicator
   - Navigation (back/next)
   - Progress bar
   - Step validation

2. **File Upload Component**
   - Drag-and-drop
   - File picker
   - Progress bar
   - File preview
   - Remove option

3. **OTP Input Component**
   - 6-digit input
   - Auto-focus
   - Resend option
   - Countdown timer

4. **Demo Chat Widget**
   - WhatsApp-like UI
   - Message bubbles
   - Input field
   - Sample questions

5. **Summary Card**
   - Section cards
   - Edit links
   - Data display
   - Validation status

6. **Status Badges**
   - Processing status
   - Approval status
   - WhatsApp status

#### Responsive Design

- **Desktop:** Full-width form, side-by-side layout
- **Tablet:** Adjusted spacing, stacked layout
- **Mobile:** Single column, full-width inputs

---

## 🔧 Technical Implementation Details

### Technology Stack

#### Frontend
- **Framework:** React 18+ with TypeScript
- **Build Tool:** Vite
- **Styling:** TailwindCSS
- **State Management:** Zustand + TanStack Query
- **Forms:** React Hook Form + Zod
- **File Upload:** react-dropzone
- **Charts:** Recharts (for admin dashboard)

#### Backend
- **Runtime:** Node.js 18+ with TypeScript
- **Framework:** Express.js
- **Database:** PostgreSQL with Prisma ORM
- **Queue:** BullMQ with Redis
- **Storage:** AWS S3
- **OCR:** AWS Textract (primary), Tesseract.js (fallback)
- **AI:** OpenAI API (GPT-4o, GPT-4 Vision)
- **CSV Parser:** papaparse
- **PDF Parser:** pdf-parse or pdfjs-dist

#### New Dependencies

**Backend:**
```json
{
  "@aws-sdk/client-s3": "^3.x",
  "@aws-sdk/client-textract": "^3.x",
  "@aws-sdk/s3-request-presigner": "^3.x",
  "papaparse": "^5.x",
  "pdf-parse": "^1.x",
  "bullmq": "^5.x"
}
```

**Frontend:**
```json
{
  "react-dropzone": "^14.x",
  "react-otp-input": "^3.x",
  "react-step-wizard": "^5.x"
}
```

---

### Services Architecture

#### 1. OnboardingService
- Manage onboarding sessions
- Track progress
- Update steps
- Handle submissions

#### 2. DocumentProcessingService
- Process CSV files
- Process PDF/images (OCR + AI)
- Extract structured data
- Generate prompts

#### 3. WhatsAppRegistrationService
- Meta Business API integration
- Phone number registration
- Webhook configuration
- Template submission

#### 4. AdminApprovalService
- Vendor review
- Approval/rejection workflow
- Notification handling

#### 5. FileUploadService
- S3 upload handling
- Presigned URL generation
- File validation
- Metadata storage

---

### Database Migrations

**Migration 1: Create Onboarding Tables**
```sql
-- VendorOnboarding table
-- OnboardingDocument table
-- OnboardingStep table
-- Update Vendor table with onboarding fields
```

**Migration 2: Add Indexes**
```sql
-- Indexes for performance
-- Foreign key constraints
```

---

### Background Jobs

**Job 1: Document Processing**
- Queue: `onboarding-document-processing`
- Process: CSV parsing, OCR, AI extraction
- Retry: 3 attempts with exponential backoff

**Job 2: Prompt Generation**
- Queue: `onboarding-prompt-generation`
- Process: Generate AI prompts from extracted data
- Retry: 2 attempts

**Job 3: WhatsApp Setup**
- Queue: `onboarding-whatsapp-setup`
- Process: Register phone, configure webhook
- Retry: 5 attempts (external API)

---

## 📊 Success Metrics & KPIs

### Primary Metrics

1. **Onboarding Completion Rate:** >80%
   - Measure: Completed onboardings / Started onboardings
   - Target: 80%+

2. **Average Time to Complete:** <30 minutes
   - Measure: Time from start to submission
   - Target: <30 minutes

3. **Document Processing Accuracy:** >90%
   - Measure: Correctly extracted products / Total products
   - Target: 90%+

4. **Admin Approval Time:** <24 hours
   - Measure: Time from submission to approval
   - Target: <24 hours

5. **Vendor Satisfaction Score:** >4.5/5
   - Measure: Post-onboarding survey
   - Target: 4.5/5

6. **Automation Rate:** >90%
   - Measure: Automated steps / Total steps
   - Target: 90%+

### Secondary Metrics

- Drop-off rate at each step
- Document processing time
- Error rate by step
- Support ticket volume
- Retry rate
- WhatsApp integration success rate

---

## 🚀 Implementation Timeline

### Phase 1: MVP (Weeks 1-2)
**Goal:** Basic onboarding flow with manual data entry

- [ ] Database schema updates
- [ ] Basic onboarding UI (Steps 1-3)
- [ ] Phone OTP verification integration
- [ ] File upload to S3
- [ ] Basic CSV processing
- [ ] Admin approval dashboard (basic)

**Deliverables:**
- Working onboarding flow (Steps 1-3)
- File upload functionality
- Basic admin dashboard

---

### Phase 2: Core Features (Weeks 3-4)
**Goal:** Automated data extraction and processing

- [ ] AI document extraction (brochure/PDF)
- [ ] Auto-prompt generation
- [ ] Data review & edit screen
- [ ] Demo chat implementation
- [ ] Summary page
- [ ] Enhanced admin dashboard

**Deliverables:**
- Complete onboarding flow (Steps 1-7)
- Automated data extraction
- Demo chat working

---

### Phase 3: WhatsApp Integration (Weeks 5-6)
**Goal:** Seamless WhatsApp Business API integration

- [ ] Meta Business API integration
- [ ] Phone number registration
- [ ] Webhook auto-configuration
- [ ] Template submission
- [ ] Test message functionality
- [ ] Status tracking

**Deliverables:**
- WhatsApp integration complete
- Automated webhook setup
- Template management

---

### Phase 4: Polish & Testing (Weeks 7-8)
**Goal:** Production-ready system

- [ ] Error handling improvements
- [ ] Validation enhancements
- [ ] UI/UX refinements
- [ ] Comprehensive testing
- [ ] Performance optimization
- [ ] Documentation
- [ ] User training materials

**Deliverables:**
- Production-ready system
- Complete documentation
- Training materials

---

## ❓ Open Questions & Clarifications Needed

### Critical Questions

1. **WhatsApp Business Account Management:**
   - Do vendors use their own Meta Business Account?
   - Or do we manage a central account for all vendors?
   - **Impact:** Affects integration approach

2. **Document Processing Priority:**
   - Which format is more common: CSV or brochure/PDF?
   - Should we prioritize one over the other?
   - **Impact:** Development priority

3. **Admin Approval Requirements:**
   - Is admin approval required for ALL vendors?
   - Or only for certain categories/risk levels?
   - **Impact:** Workflow complexity

4. **Demo Chat Scope:**
   - Should demo chat be full conversation simulation?
   - Or limited to specific pre-defined questions?
   - **Impact:** Implementation complexity

5. **Default Data Specifications:**
   - Any specific defaults for business settings?
   - (e.g., delivery time, minimum order, preparation time)
   - **Impact:** Default value configuration

6. **File Size Limits:**
   - Maximum file size for CSV uploads?
   - Maximum file size for brochure/PDF uploads?
   - **Impact:** S3 configuration and validation

7. **Multi-Language Support:**
   - Should onboarding UI support multiple languages?
   - Which languages are priority?
   - **Impact:** UI development and translation

8. **Payment Integration:**
   - Should payment gateway setup be included in onboarding?
   - Or handled separately after approval?
   - **Impact:** Onboarding flow length

### Nice-to-Have Features

1. **Video Tutorial:** Step-by-step video guide
2. **Live Chat Support:** Real-time support during onboarding
3. **Progress Saving:** Auto-save progress, resume later
4. **Bulk Import:** Import multiple vendors at once (admin)
5. **Onboarding Analytics:** Track drop-off points, optimize flow

---

## 📚 References & Resources

### Existing Documentation
- `requirements/documentation/vendor_onboarding_workflow_direct_meta_api_detailed.md`
- `docs/architecture/authentication.md`
- `backend/src/routes/auth.ts`
- `backend/src/services/whatsappClient.ts`

### External Resources
- [Meta WhatsApp Business API Documentation](https://developers.facebook.com/docs/whatsapp)
- [AWS Textract Documentation](https://docs.aws.amazon.com/textract/)
- [OpenAI GPT-4 Vision API](https://platform.openai.com/docs/guides/vision)

### Similar Implementations
- Stripe Connect onboarding
- Shopify merchant onboarding
- WhatsApp Business API onboarding flows

---

## ✅ Acceptance Criteria

### Functional Requirements

1. ✅ Vendor can complete onboarding in <30 minutes
2. ✅ All vendor data is automatically extracted from documents
3. ✅ Demo chat accurately reflects vendor's configuration
4. ✅ WhatsApp integration is automated
5. ✅ Admin can review and approve vendors efficiently
6. ✅ System handles errors gracefully
7. ✅ Progress is saved and can be resumed
8. ✅ All validation rules are enforced

### Non-Functional Requirements

1. ✅ System handles 100+ concurrent onboardings
2. ✅ Document processing completes in <5 minutes
3. ✅ UI is responsive and works on mobile
4. ✅ All sensitive data is encrypted
5. ✅ System is accessible (WCAG 2.1 AA)
6. ✅ Error messages are clear and actionable
7. ✅ System logs all actions for audit

---

## 📝 Notes & Considerations

### Security Considerations
- Encrypt all uploaded documents
- Validate file types and sizes
- Sanitize all user inputs
- Use presigned URLs for S3 uploads
- Implement rate limiting
- Audit log all actions

### Performance Considerations
- Process documents asynchronously
- Cache extracted data
- Optimize database queries
- Use CDN for static assets
- Implement pagination for lists

### Scalability Considerations
- Use queue system for processing
- Horizontal scaling capability
- Database indexing
- S3 for file storage
- Redis for caching

### Maintenance Considerations
- Comprehensive logging
- Error monitoring
- Performance monitoring
- Regular backups
- Documentation updates

---

**Document Status:** ✅ Complete - Ready for Review  
**Next Steps:** Review with stakeholders, answer open questions, begin Phase 1 implementation

---

*This document will be updated as requirements evolve and implementation progresses.*

