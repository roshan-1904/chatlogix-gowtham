# Vendor Settings - Implementation Plan

> **📚 Related Documentation**: [Documentation Index](./INDEX.md) | [Open Questions](./OPEN_QUESTIONS.md) | [API Documentation](./API_DOCUMENTATION.md) | [Architecture](./ARCHITECTURE.md)

## Overview

This document provides a comprehensive, phased implementation plan for the Vendor Settings page based on approved decisions. The plan is organized into phases to allow incremental delivery and early value.

> **Implementation status (verified against code, Sep 2026)**: this is the original Dec 2024 plan, kept as-is below for history — the checkboxes are not current status. What actually shipped: **Phase 1 backend** is essentially complete (phone/email verification services and endpoints, business-info/notification-settings/matching-config/timezone endpoints, `ai-prompts` re-authorized to `requireVendorAccess`, `settingsRateLimit` middleware — all present in `backend/src/routes/vendors.ts`). **Phase 1 frontend** shipped with a simpler component structure than planned (one `Settings.tsx` + 5 tab components + a handful of shared primitives, not the full `SettingsLayout`/`SettingsHeader`/`SettingsTabs`/per-field component tree), auto-save to localStorage is implemented (`hooks/settings/useAutoSave.ts`), but several described sub-features were never built into the UI: AI Model Selection, Order Settings' preparation-time-type config, Notifications' order-status checkboxes and quiet hours, and Advanced tab's field-mapping/language/AI-matching-model dropdowns. **Phase 2 (Templates) and Phase 3 (Mobile settings)** were not built at all — no templates system/API and no settings page in `vendor-mobile`. See each `TAB_*.md` file's status note for the per-tab specifics.

## Implementation Phases

### Phase 1: Core Settings (MVP) - 8-10 days
**Goal**: Deliver core settings functionality with security and UX essentials

### Phase 2: Templates & Enhancements - 5-7 days
**Goal**: Add settings templates and improve onboarding experience

### Phase 3: Mobile App - 3-5 days
**Goal**: Full mobile app settings page

---

## Phase 1: Core Settings (MVP)

### Timeline: 8-10 days
### Priority: 🔴 Critical

### Backend Tasks (3-4 days)

#### Day 1-2: Verification Services

**Task 1.1: Phone Verification for Settings Updates**
- [ ] Create `backend/src/services/settingsVerification.ts`
- [ ] Implement `sendPhoneVerificationCode(vendorId, newPhoneNumber)` function
  - Reuse existing `phoneAuth.ts` service
  - Store verification session with vendorId and new phone number
  - Return sessionInfo
- [ ] Implement `verifyPhoneChange(vendorId, sessionInfo, code)` function
  - Verify OTP code
  - Update vendor phone number if verified
  - Return success status
- [ ] Add verification session storage (Redis or in-memory Map)
- [ ] Add expiration (5 minutes) and attempt limits (5 attempts)

**Task 1.2: Email Verification Service**
- [ ] Create `backend/src/services/emailVerification.ts`
- [ ] Set up email service (choose: Nodemailer, SendGrid, AWS SES, or Resend)
- [ ] Implement `sendEmailVerificationCode(vendorId, newEmail)` function
  - Generate 6-digit verification code
  - Store code in Redis with expiration (10 minutes)
  - Send email with verification code
  - Return success status
- [ ] Implement `verifyEmailChange(vendorId, code)` function
  - Verify code from Redis
  - Update vendor email if verified
  - Return success status
- [ ] Add email templates for verification codes
- [ ] Add rate limiting (max 3 emails per hour per vendor)

**Task 1.3: Verification Endpoints**
- [ ] Create `backend/src/routes/settings-verification.ts`
- [ ] `POST /api/vendors/:id/verify-phone/send` - Send phone verification code
- [ ] `POST /api/vendors/:id/verify-phone/confirm` - Confirm phone change
- [ ] `POST /api/vendors/:id/verify-email/send` - Send email verification code
- [ ] `POST /api/vendors/:id/verify-email/confirm` - Confirm email change
- [ ] Add authorization middleware (`requireVendorAccess`)
- [ ] Add validation schemas (Zod)
- [ ] Add error handling

**Files to Create/Modify**:
- `backend/src/services/settingsVerification.ts` (new)
- `backend/src/services/emailVerification.ts` (new)
- `backend/src/routes/settings-verification.ts` (new)
- `backend/src/index.ts` (add route)

#### Day 2-3: API Endpoints

**Task 1.4: Business Information API**
- [ ] Update `PUT /api/vendors/:id/business-info` endpoint
- [ ] Add validation schema for:
  - `businessName` (required, 1-100 chars)
  - `phone` (optional, validated format)
  - `email` (optional, validated format)
  - `category` (optional, enum)
- [ ] Implement phone/email change flow:
  - If phone changed → require verification
  - If email changed → require verification
  - Return verification status if needed
- [ ] Add authorization (`requireVendorAccess`)
- [ ] Add rate limiting (10 updates/min)
- [ ] Update Prisma schema if needed

**Task 1.5: Notification Settings API**
- [ ] Create `GET /api/vendors/:id/notification-settings` endpoint
- [ ] Create `PUT /api/vendors/:id/notification-settings` endpoint
- [ ] Add validation schema for notification settings JSON
- [ ] Validate structure:
  - `orderUpdates`, `paymentLinks`, `shippingUpdates` (boolean)
  - `enabledStatuses` (array of strings)
  - `quietHours` (object with start/end times)
- [ ] Add authorization (`requireVendorAccess`)
- [ ] Add rate limiting (10 updates/min)

**Task 1.6: Matching Configuration API**
- [ ] Create `GET /api/vendors/:id/matching-config` endpoint
- [ ] Create `PUT /api/vendors/:id/matching-config` endpoint
- [ ] Add validation schema for matching config JSON
- [ ] Validate structure:
  - `matchingThreshold` (number, 0-1)
  - `fuzzyMatching` (boolean)
  - `aiMatching` (boolean)
  - `fieldMappings` (object)
  - `supportedLanguages` (array)
  - `aiMatchingModel` (string, enum)
- [ ] Add authorization (`requireVendorAccess`)
- [ ] Add rate limiting (10 updates/min)

**Task 1.7: Update Existing APIs**
- [ ] Update `PUT /api/vendors/:id/ai-prompts`:
  - Change authorization from `requireRole('admin')` to `requireVendorAccess`
  - Add missing fields: `aiContentResponsibilities`, `aiContentConversationRules`, `aiContentImportantInstructions`
  - Add validation for all fields
- [ ] Update `GET /api/vendors/:id/order-settings`:
  - Add `orderPrefix` and `minimumOrderValue` fields
- [ ] Update `PUT /api/vendors/:id/order-settings`:
  - Add `orderPrefix` and `minimumOrderValue` fields
  - Add validation

**Task 1.8: Rate Limiting Middleware**
- [ ] Create `backend/src/middleware/settingsRateLimit.ts`
- [ ] Implement rate limiter: 10 requests per minute per vendor
- [ ] Use Redis store (reuse existing Redis connection)
- [ ] Add to all settings update endpoints
- [ ] Return proper error responses (429 status)

**Files to Create/Modify**:
- `backend/src/routes/vendors.ts` (update existing endpoints)
- `backend/src/middleware/settingsRateLimit.ts` (new)
- `backend/src/utils/validation.ts` (add schemas)

#### Day 3-4: Testing & Documentation

**Task 1.9: Backend Testing**
- [ ] Write unit tests for verification services
- [ ] Write integration tests for all API endpoints
- [ ] Test rate limiting
- [ ] Test authorization (vendor can only update own settings)
- [ ] Test validation (invalid data rejected)
- [ ] Test error handling

**Task 1.10: API Documentation**
- [ ] Update OpenAPI/Swagger documentation
- [ ] Document all new endpoints
- [ ] Document verification flow
- [ ] Add example requests/responses

### Frontend Tasks (5-6 days)

#### Day 1-2: Project Setup & Base Components

**Task 1.11: Project Structure**
- [ ] Create `frontend_v2/apps/web-vendor/src/pages/Settings.tsx`
- [ ] Create `frontend_v2/apps/web-vendor/src/components/settings/` directory
- [ ] Create base components:
  - `SettingsLayout.tsx` - Main container with tabs
  - `SettingsHeader.tsx` - Page header
  - `SettingsTabs.tsx` - Tab navigation
  - `SettingsContent.tsx` - Content area
  - `SettingsFooter.tsx` - Save/Cancel buttons
- [ ] Add route in `App.tsx`: `/settings`
- [ ] Update sidebar navigation (already exists)

**Task 1.12: Base UI Components**
- [ ] Create `FormField.tsx` - Reusable form field component
- [ ] Create `Tooltip.tsx` - Tooltip component (or use existing)
- [ ] Create `HelpText.tsx` - Help text component
- [ ] Create `Note.tsx` - Note/warning component
- [ ] Create `ConfirmationDialog.tsx` - Confirmation modal
- [ ] Create `LoadingSpinner.tsx` - Loading state component
- [ ] Style with TailwindCSS

**Task 1.13: State Management Setup**
- [ ] Set up React Hook Form for form state
- [ ] Create Zod validation schemas for each tab
- [ ] Set up TanStack Query for API calls
- [ ] Create API client functions for all endpoints
- [ ] Set up error handling

**Files to Create**:
- `frontend_v2/apps/web-vendor/src/pages/Settings.tsx`
- `frontend_v2/apps/web-vendor/src/components/settings/SettingsLayout.tsx`
- `frontend_v2/apps/web-vendor/src/components/settings/SettingsHeader.tsx`
- `frontend_v2/apps/web-vendor/src/components/settings/SettingsTabs.tsx`
- `frontend_v2/apps/web-vendor/src/components/settings/SettingsContent.tsx`
- `frontend_v2/apps/web-vendor/src/components/settings/SettingsFooter.tsx`
- `frontend_v2/apps/web-vendor/src/components/settings/FormField.tsx`
- `frontend_v2/apps/web-vendor/src/components/settings/Tooltip.tsx`
- `frontend_v2/apps/web-vendor/src/components/settings/HelpText.tsx`
- `frontend_v2/apps/web-vendor/src/components/settings/Note.tsx`
- `frontend_v2/apps/web-vendor/src/components/settings/ConfirmationDialog.tsx`
- `frontend_v2/apps/web-vendor/src/api/settings.ts` (API client)

#### Day 2-3: Account & Business Tab

**Task 1.14: Account & Business Tab Implementation**
- [ ] Create `AccountBusinessTab.tsx`
- [ ] Implement form fields:
  - Business Name (text input)
  - Phone Number (text input with verification flow)
  - Email (text input with verification flow)
  - Category (dropdown/select)
- [ ] Add tooltips for all fields
- [ ] Add help text and notes
- [ ] Implement phone verification flow:
  - Show "Verify" button when phone changes
  - Open verification modal
  - Send OTP code
  - Verify code
  - Update phone on success
- [ ] Implement email verification flow:
  - Show "Verify" button when email changes
  - Send verification email
  - Enter code to verify
  - Update email on success
- [ ] Add inline validation
- [ ] Add confirmation dialog before save
- [ ] Connect to API endpoints

**Files to Create**:
- `frontend_v2/apps/web-vendor/src/components/settings/tabs/AccountBusinessTab.tsx`
- `frontend_v2/apps/web-vendor/src/components/settings/PhoneVerificationModal.tsx`
- `frontend_v2/apps/web-vendor/src/components/settings/EmailVerificationModal.tsx`

#### Day 3-4: AI Configuration Tab

**Task 1.15: AI Configuration Tab Implementation**
- [ ] Create `AIConfigTab.tsx`
- [ ] Implement Bot Identity section:
  - Bot Name (text input)
  - Personality (textarea)
- [ ] Implement AI Model Selection:
  - Model dropdown (gpt-4.1-mini, gpt-4o-mini, etc.)
  - Cost indicator
  - Model description
- [ ] Implement System Prompts section:
  - System Prompt (textarea, 500-800 tokens)
  - Product Information (textarea)
- [ ] Implement Conversation Templates:
  - Greeting (textarea)
  - Closing (textarea)
- [ ] Implement AI Content Sections:
  - Responsibilities (textarea)
  - Conversation Rules (textarea)
  - Important Instructions (textarea)
- [ ] Add tooltips, help text, notes for all fields
- [ ] Add character/token counters
- [ ] Add inline validation
- [ ] Add confirmation dialog before save
- [ ] Connect to API endpoints

**Files to Create**:
- `frontend_v2/apps/web-vendor/src/components/settings/tabs/AIConfigTab.tsx`
- `frontend_v2/apps/web-vendor/src/components/settings/TokenCounter.tsx`

#### Day 4-5: Order Settings Tab

**Task 1.16: Order Settings Tab Implementation**
- [ ] Create `OrderSettingsTab.tsx`
- [ ] Implement Order Configuration:
  - Order Prefix (text input)
  - Minimum Order Value (number input)
- [ ] Implement Delivery Preferences:
  - Ask for Preferred Delivery Date (toggle)
- [ ] Implement Preparation Time Configuration:
  - Type selector (after_order, fixed_minutes, variable, ready_to_ship)
  - Conditional fields based on type
- [ ] Add tooltips, help text, notes
- [ ] Add inline validation
- [ ] Add confirmation dialog before save
- [ ] Connect to API endpoints

**Files to Create**:
- `frontend_v2/apps/web-vendor/src/components/settings/tabs/OrderSettingsTab.tsx`

#### Day 5-6: Notifications & Advanced Tabs

**Task 1.17: Notifications Tab Implementation**
- [ ] Create `NotificationsTab.tsx`
- [ ] Implement Notification Preferences:
  - Order Updates (toggle)
  - Payment Links (toggle)
  - Shipping Updates (toggle)
- [ ] Implement Order Status Notifications:
  - Multi-select for enabled statuses
- [ ] Implement Quiet Hours:
  - Start time picker
  - End time picker
  - Timezone display
- [ ] Add tooltips, help text, notes
- [ ] Add inline validation
- [ ] Add confirmation dialog before save
- [ ] Connect to API endpoints

**Task 1.18: Advanced Tab Implementation**
- [ ] Create `AdvancedTab.tsx`
- [ ] Implement Product Matching Configuration:
  - Matching Threshold (slider, 0-1)
  - Fuzzy Matching (toggle)
  - AI Matching (toggle)
  - Field Mappings (key-value pairs)
  - Supported Languages (multi-select)
  - AI Matching Model (dropdown)
- [ ] Implement Timezone Settings:
  - Timezone selector
- [ ] Add tooltips, help text, notes
- [ ] Add inline validation
- [ ] Add confirmation dialog before save
- [ ] Connect to API endpoints

**Files to Create**:
- `frontend_v2/apps/web-vendor/src/components/settings/tabs/NotificationsTab.tsx`
- `frontend_v2/apps/web-vendor/src/components/settings/tabs/AdvancedTab.tsx`

#### Day 6: Auto-Save & Polish

**Task 1.19: localStorage Auto-Save**
- [ ] Implement auto-save to localStorage:
  - Save form state every 30 seconds
  - Save on field blur
  - Save on tab change
- [ ] Implement restore on page load:
  - Check for saved draft
  - Show "Restore draft?" prompt
  - Restore form state if confirmed
- [ ] Clear draft on successful save
- [ ] Handle localStorage quota errors gracefully

**Task 1.20: UX Polish**
- [ ] Add loading states for all API calls
- [ ] Add success/error toast notifications
- [ ] Add unsaved changes warning on navigation
- [ ] Add keyboard shortcuts (Ctrl+S to save)
- [ ] Improve mobile responsiveness
- [ ] Add accessibility features (ARIA labels, keyboard navigation)
- [ ] Test all tooltips and help text
- [ ] Verify all validation messages
- [ ] Test confirmation dialogs

**Files to Modify**:
- `frontend_v2/apps/web-vendor/src/components/settings/SettingsLayout.tsx`
- `frontend_v2/apps/web-vendor/src/hooks/useAutoSave.ts` (new)

### Phase 1 Deliverables

✅ **Backend**:
- Phone & email verification services
- All API endpoints (business-info, notifications, matching-config, etc.)
- Rate limiting middleware
- Updated existing APIs
- Comprehensive tests

✅ **Frontend**:
- Complete settings page with all 5 tabs
- Verification flows for phone/email
- Auto-save functionality
- Confirmation dialogs
- Inline validation
- Tooltips and help text
- Responsive design

---

## Phase 2: Templates & Enhancements

### Timeline: 5-7 days
### Priority: 🟡 Important

### Backend Tasks (2-3 days)

#### Day 1-2: Templates System

**Task 2.1: Templates Data Structure**
- [ ] Create `backend/src/data/settingsTemplates.ts`
- [ ] Define template structure:
  - Template ID, name, description
  - Template data (all settings fields)
- [ ] Create 3-5 templates:
  - Food & Restaurant
  - Retail & E-commerce
  - Service Business
  - Healthcare
  - Education
- [ ] Add template metadata (category, use case)

**Task 2.2: Templates API**
- [ ] Create `GET /api/settings/templates` endpoint
  - Return list of all templates
  - Include metadata
- [ ] Create `GET /api/settings/templates/:id` endpoint
  - Return specific template details
- [ ] Create `POST /api/vendors/:id/settings/apply-template` endpoint
  - Accept template ID
  - Apply template settings to vendor
  - Validate all settings
  - Return updated vendor settings
- [ ] Add authorization (vendors can apply templates)
- [ ] Add validation

**Files to Create**:
- `backend/src/data/settingsTemplates.ts`
- `backend/src/routes/settings-templates.ts`

#### Day 2-3: Testing & Documentation

**Task 2.3: Templates Testing**
- [ ] Test template application
- [ ] Test template validation
- [ ] Test edge cases (invalid template, missing fields)
- [ ] Update API documentation

### Frontend Tasks (3-4 days)

#### Day 1-2: Templates UI

**Task 2.4: Templates Component**
- [ ] Create `TemplatesModal.tsx` component
- [ ] Display template cards with:
  - Template name
  - Description
  - Preview of key settings
  - "Apply Template" button
- [ ] Add template selection flow:
  - Show confirmation dialog
  - Warn about overwriting current settings
  - Apply template on confirm
  - Show success message
- [ ] Add "Browse Templates" button in settings header
- [ ] Style with TailwindCSS

**Task 2.5: Template Preview**
- [ ] Create `TemplatePreview.tsx` component
- [ ] Show side-by-side comparison:
  - Current settings vs. Template settings
- [ ] Highlight differences
- [ ] Allow selective application (future enhancement)

**Files to Create**:
- `frontend_v2/apps/web-vendor/src/components/settings/TemplatesModal.tsx`
- `frontend_v2/apps/web-vendor/src/components/settings/TemplatePreview.tsx`

#### Day 2-3: Enhancements

**Task 2.6: Settings Search (Optional)**
- [ ] Add search bar in settings header
- [ ] Filter tabs/sections by search query
- [ ] Highlight matching fields
- [ ] Add keyboard shortcut (Ctrl+F)

**Task 2.7: Settings Export (Read-only)**
- [ ] Add "Export Settings" button
- [ ] Generate JSON file with current settings
- [ ] Include metadata (export date, vendor ID)
- [ ] Download file

**Task 2.8: UX Improvements**
- [ ] Add settings change summary (what changed)
- [ ] Improve confirmation dialog messages
- [ ] Add "Reset to Defaults" option
- [ ] Add settings validation summary before save
- [ ] Improve error messages

**Files to Create/Modify**:
- `frontend_v2/apps/web-vendor/src/components/settings/SettingsSearch.tsx` (optional)
- `frontend_v2/apps/web-vendor/src/utils/settingsExport.ts`

### Phase 2 Deliverables

✅ **Backend**:
- Settings templates system
- Templates API endpoints
- Template application logic

✅ **Frontend**:
- Templates modal and selection UI
- Template preview component
- Settings export functionality
- Enhanced UX features

---

## Phase 3: Mobile App

### Timeline: 3-5 days
### Priority: 🟢 Nice-to-Have

### Mobile App Tasks

#### Day 1-2: Mobile Settings Page Structure

**Task 3.1: Mobile Settings Page**
- [ ] Create `frontend_v2/apps/vendor-mobile/src/pages/Settings.tsx`
- [ ] Create mobile-specific components:
  - `MobileSettingsLayout.tsx`
  - `MobileSettingsTabs.tsx` (bottom navigation or drawer)
  - `MobileSettingsContent.tsx`
- [ ] Adapt all 5 tabs for mobile:
  - Account & Business
  - AI Configuration
  - Order Settings
  - Notifications
  - Advanced
- [ ] Optimize for small screens:
  - Stack form fields vertically
  - Use mobile-friendly inputs
  - Optimize tooltips (tap to show)
  - Simplify navigation

**Files to Create**:
- `frontend_v2/apps/vendor-mobile/src/pages/Settings.tsx`
- `frontend_v2/apps/vendor-mobile/src/components/settings/` (all components)

#### Day 2-3: Mobile-Specific Features

**Task 3.2: Mobile UX Optimizations**
- [ ] Implement bottom sheet for modals
- [ ] Add swipe gestures for navigation
- [ ] Optimize keyboard handling
- [ ] Add pull-to-refresh
- [ ] Optimize for iOS and Android
- [ ] Test on various screen sizes

**Task 3.3: Mobile Verification Flows**
- [ ] Adapt phone verification for mobile:
  - Use native SMS reading (if available)
  - Optimize OTP input
- [ ] Adapt email verification for mobile:
  - Deep link to email app
  - Optimize code entry

#### Day 3-4: Testing & Polish

**Task 3.4: Mobile Testing**
- [ ] Test on iOS devices
- [ ] Test on Android devices
- [ ] Test on tablets
- [ ] Test all verification flows
- [ ] Test all form submissions
- [ ] Performance testing

**Task 3.5: Mobile Polish**
- [ ] Add loading states
- [ ] Add error handling
- [ ] Add offline support (if needed)
- [ ] Optimize bundle size
- [ ] Add analytics

### Phase 3 Deliverables

✅ **Mobile App**:
- Complete settings page
- All 5 tabs adapted for mobile
- Mobile-optimized verification flows
- Responsive design
- Native mobile UX patterns

---

## Implementation Checklist

### Pre-Implementation

- [ ] Review all documentation
- [ ] Review approved decisions in `OPEN_QUESTIONS.md`
- [ ] Set up development environment
- [ ] Create feature branch: `feature/vendor-settings`
- [ ] Set up project board/tracking

### Phase 1: Core Settings

#### Backend
- [ ] Phone verification service
- [ ] Email verification service
- [ ] Verification endpoints
- [ ] Business info API
- [ ] Notification settings API
- [ ] Matching config API
- [ ] Update existing APIs
- [ ] Rate limiting middleware
- [ ] Backend tests
- [ ] API documentation

#### Frontend
- [ ] Project structure
- [ ] Base components
- [ ] State management setup
- [ ] Account & Business tab
- [ ] AI Configuration tab
- [ ] Order Settings tab
- [ ] Notifications tab
- [ ] Advanced tab
- [ ] Auto-save functionality
- [ ] UX polish
- [ ] Frontend tests

### Phase 2: Templates

- [ ] Templates data structure
- [ ] Templates API
- [ ] Templates UI
- [ ] Template preview
- [ ] Settings export
- [ ] Enhancements

### Phase 3: Mobile

- [ ] Mobile settings page
- [ ] Mobile components
- [ ] Mobile verification flows
- [ ] Mobile testing
- [ ] Mobile polish

### Post-Implementation

- [ ] Code review
- [ ] Integration testing
- [ ] User acceptance testing
- [ ] Performance testing
- [ ] Security audit
- [ ] Documentation updates
- [ ] Deployment plan
- [ ] Rollout strategy

---

## Technical Decisions

### Verification Services

**Phone Verification**:
- Reuse existing `phoneAuth.ts` service
- Store verification sessions in Redis (or in-memory Map for MVP)
- Session expiration: 5 minutes
- Max attempts: 5

**Email Verification**:
- Use Nodemailer with SMTP (or SendGrid/Resend/AWS SES)
- Store verification codes in Redis
- Code expiration: 10 minutes
- Rate limit: 3 emails per hour per vendor

### Rate Limiting

- Use `express-rate-limit` with Redis store
- Limit: 10 requests per minute per vendor
- Apply to all settings update endpoints
- Return 429 status with retry-after header

### Auto-Save

- Save to localStorage every 30 seconds
- Save on field blur
- Save on tab change
- Restore on page load with confirmation
- Clear on successful save

### Confirmation Dialogs

- Show for ALL settings changes (as per decision)
- Include summary of changes
- Allow cancel
- Show loading state during save

### Validation

- Use Zod schemas for all validation
- Inline errors below fields
- Real-time validation on blur
- Form-level validation on submit
- Clear error messages

---

## Testing Strategy

### Unit Tests

- [ ] Verification services
- [ ] API route handlers
- [ ] Validation schemas
- [ ] Utility functions
- [ ] React components
- [ ] Custom hooks

### Integration Tests

- [ ] API endpoints (happy path)
- [ ] API endpoints (error cases)
- [ ] Verification flows
- [ ] Rate limiting
- [ ] Authorization
- [ ] Form submissions

### E2E Tests

- [ ] Complete settings update flow
- [ ] Phone verification flow
- [ ] Email verification flow
- [ ] Template application
- [ ] Auto-save restore
- [ ] Error handling

### Manual Testing

- [ ] All tabs functionality
- [ ] All form fields
- [ ] All tooltips and help text
- [ ] All validation messages
- [ ] Mobile responsiveness
- [ ] Accessibility
- [ ] Browser compatibility

---

## Deployment Plan

### Phase 1 Deployment

1. **Backend Deployment**:
   - Deploy verification services
   - Deploy new API endpoints
   - Deploy rate limiting
   - Run database migrations (if any)
   - Monitor for errors

2. **Frontend Deployment**:
   - Deploy settings page
   - Deploy all components
   - Test in staging environment
   - Monitor for errors

3. **Rollout**:
   - Enable for beta vendors first
   - Monitor usage and errors
   - Gather feedback
   - Fix critical issues
   - Roll out to all vendors

### Phase 2 Deployment

- Deploy templates system
- Deploy templates UI
- Announce to vendors
- Monitor usage

### Phase 3 Deployment

- Deploy mobile settings page
- Test on iOS and Android
- Roll out gradually
- Monitor performance

---

## Risk Mitigation

### Technical Risks

**Risk**: Verification service failures
- **Mitigation**: Add retry logic, fallback to manual verification
- **Monitoring**: Track verification success rates

**Risk**: Rate limiting too strict
- **Mitigation**: Start with 10/min, adjust based on usage
- **Monitoring**: Track rate limit hits

**Risk**: Auto-save localStorage quota
- **Mitigation**: Limit saved data size, handle quota errors gracefully
- **Monitoring**: Track localStorage errors

### UX Risks

**Risk**: Confirmation dialogs too frequent
- **Mitigation**: Start with all changes, adjust based on feedback
- **Monitoring**: Track user complaints

**Risk**: Mobile app performance
- **Mitigation**: Optimize bundle size, lazy load components
- **Monitoring**: Track performance metrics

---

## Success Metrics

### Phase 1 Success Criteria

- ✅ All 5 tabs functional
- ✅ Phone/email verification working
- ✅ All API endpoints working
- ✅ Auto-save working
- ✅ Confirmation dialogs working
- ✅ No critical bugs
- ✅ Mobile responsive

### Phase 2 Success Criteria

- ✅ Templates system working
- ✅ Templates applied successfully
- ✅ Settings export working
- ✅ Positive user feedback

### Phase 3 Success Criteria

- ✅ Mobile settings page functional
- ✅ Mobile verification flows working
- ✅ Good mobile UX
- ✅ Performance acceptable

---

## Timeline Summary

| Phase | Duration | Priority | Status |
|-------|----------|----------|--------|
| Phase 1: Core Settings | 8-10 days | 🔴 Critical | ⬜ Not Started |
| Phase 2: Templates | 5-7 days | 🟡 Important | ⬜ Not Started |
| Phase 3: Mobile | 3-5 days | 🟢 Nice-to-Have | ⬜ Not Started |
| **Total** | **16-22 days** | | |

---

## Next Steps

1. **Review this plan** with the team
2. **Assign tasks** to developers
3. **Set up project tracking** (Jira, GitHub Projects, etc.)
4. **Start Phase 1** implementation
5. **Daily standups** to track progress
6. **Weekly reviews** to adjust plan if needed

---

## Questions or Issues?

If you encounter any issues or have questions during implementation:

1. Check the [Open Questions](./OPEN_QUESTIONS.md) document
2. Review the [API Documentation](./API_DOCUMENTATION.md)
3. Review the [Architecture](./ARCHITECTURE.md) document
4. Check tab-specific documentation (`TAB_*.md`)
5. Ask the team for clarification

---

**Status**: 📋 Ready for Implementation  
**Last Updated**: December 2024  
**Version**: 1.0

