---
name: Vendor Settings Implementation Plan
overview: A clean, phased implementation plan for the Vendor Settings page that follows existing codebase patterns and ensures maintainable architecture for both backend and frontend.
todos:
  - id: backend-verification-services
    content: Create phone and email verification services following existing phoneAuth.ts pattern
    status: completed
  - id: backend-rate-limiting
    content: Create settings rate limiting middleware following dashboardStatsRateLimit pattern
    status: completed
  - id: backend-validation-schemas
    content: Create Zod validation schemas for all settings endpoints
    status: completed
  - id: backend-verification-routes
    content: Create verification routes (phone/email send/confirm endpoints)
    status: completed
    dependencies:
      - backend-verification-services
  - id: backend-settings-routes
    content: Create/update settings routes (business-info, notifications, matching-config, etc.)
    status: completed
    dependencies:
      - backend-validation-schemas
      - backend-rate-limiting
  - id: backend-update-existing-routes
    content: Update existing routes (ai-prompts authorization, order-settings fields)
    status: completed
    dependencies:
      - backend-validation-schemas
  - id: frontend-project-structure
    content: Create frontend project structure (pages, components, hooks, api, types)
    status: completed
  - id: frontend-api-client
    content: Create API client functions for all settings endpoints
    status: completed
    dependencies:
      - frontend-project-structure
  - id: frontend-types-schemas
    content: Create TypeScript types and Zod validation schemas
    status: completed
    dependencies:
      - frontend-project-structure
  - id: frontend-custom-hooks
    content: Create custom hooks (useVendorSettings, useAutoSave) following useProductForm pattern
    status: completed
    dependencies:
      - frontend-api-client
      - frontend-types-schemas
  - id: frontend-reusable-components
    content: Create reusable components (FormField, Tooltip, HelpText, ConfirmationDialog)
    status: completed
    dependencies:
      - frontend-project-structure
  - id: frontend-tab-components
    content: Create all 5 tab components (AccountBusiness, AIConfig, OrderSettings, Notifications, Advanced)
    status: completed
    dependencies:
      - frontend-custom-hooks
      - frontend-reusable-components
  - id: frontend-integration
    content: Integrate Settings page with routing, add error handling and loading states
    status: completed
    dependencies:
      - frontend-tab-components
  - id: testing-backend
    content: Write backend tests (unit tests for services, integration tests for routes)
    status: pending
    dependencies:
      - backend-settings-routes
  - id: testing-frontend
    content: Write frontend tests (component tests, hook tests, integration tests)
    status: pending
    dependencies:
      - frontend-integration
---

# Vendor Settings - Clean Implementation Plan

## Overview

This plan provides a structured approach to implementing the Vendor Settings page, following existing codebase patterns and ensuring clean, maintainable code. The implementation is divided into 3 phases with clear separation of concerns.

## Architecture Principles

1. **Backend**: Service layer pattern with route handlers, validation schemas, and middleware
2. **Frontend**: Component composition with custom hooks, React Hook Form, and TanStack Query
3. **Validation**: Shared Zod schemas between frontend and backend
4. **Error Handling**: Consistent error types and user-friendly messages
5. **Rate Limiting**: Reuse existing Redis-based rate limiting pattern

## Phase 1: Core Backend Infrastructure (3-4 days)

### Step 1.1: Verification Services

**Files to Create:**

- `backend/src/services/settingsVerification.ts` - Phone verification for settings updates
- `backend/src/services/emailVerification.ts` - Email verification service

**Implementation Pattern:**

- Reuse `phoneAuth.ts` pattern for phone verification
- Create email verification service similar to phone auth
- **Decision**: Store verification sessions in Redis (reuse `getRedisClient()`) for production readiness
  - Note: `phoneAuth.ts` currently uses in-memory Map, but for settings verification we'll use Redis for better scalability
  - Fallback to in-memory if Redis unavailable (graceful degradation)
- Use same session expiration pattern (5 min for phone, 10 min for email)

**Key Functions:**

```typescript
// settingsVerification.ts
export async function sendPhoneVerificationCode(vendorId: string, newPhoneNumber: string): Promise<{ sessionInfo: string }>
export async function verifyPhoneChange(vendorId: string, sessionInfo: string, code: string): Promise<{ success: boolean }>

// emailVerification.ts  
export async function sendEmailVerificationCode(vendorId: string, newEmail: string): Promise<{ success: boolean }>
export async function verifyEmailChange(vendorId: string, code: string): Promise<{ success: boolean }>
```

**Dependencies:**

- Reuse existing Redis client from `backend/src/utils/redis.ts`
- Use existing logger from `backend/src/logger.ts`
- Follow error handling pattern from `backend/src/middleware/errorHandler.ts`

### Step 1.2: Rate Limiting Middleware

**File to Create:**

- `backend/src/middleware/settingsRateLimit.ts`

**Implementation Pattern:**

- Follow exact pattern from `backend/src/middleware/rateLimit.ts`
- Use Redis store with fallback to in-memory
- Limit: 10 requests per minute per vendor
- Key generator: `vendor:${vendorId}`

**Code Structure:**

```typescript
export const settingsRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req) => `vendor:${(req as any).user?.vendorId}`,
  // ... same pattern as dashboardStatsRateLimit
});
```

### Step 1.3: Validation Schemas

**File to Create:**

- `backend/src/utils/validation/settingsSchemas.ts`

**Implementation Pattern:**

- Create Zod schemas matching frontend schemas
- Export schemas for reuse in routes
- Include all validation rules from tab documentation

**Schemas Needed:**

- `businessInfoSchema` - Business name, phone, email, category
- `aiConfigSchema` - AI bot settings, prompts, model selection
- `orderSettingsSchema` - Order prefix, min value, preparation config
- `notificationSettingsSchema` - Notification preferences, quiet hours
- `matchingConfigSchema` - Product matching configuration

### Step 1.4: API Routes

**Files to Create/Modify:**

- `backend/src/routes/settings-verification.ts` (new)
- `backend/src/routes/vendors.ts` (modify - add new endpoints)

**Route Structure:**

```typescript
// Verification routes
POST /api/vendors/:id/verify-phone/send
POST /api/vendors/:id/verify-phone/confirm
POST /api/vendors/:id/verify-email/send
POST /api/vendors/:id/verify-email/confirm

// Settings routes (add to vendors.ts)
PUT /api/vendors/:id/business-info
GET /api/vendors/:id/notification-settings
PUT /api/vendors/:id/notification-settings
GET /api/vendors/:id/matching-config
PUT /api/vendors/:id/matching-config
PUT /api/vendors/:id/timezone
```

**Middleware Chain:**

- `requireVendorAccess(req => req.params.id)` - Authorization
- `settingsRateLimit` - Rate limiting (for PUT endpoints)
- Zod validation - Request body validation
- Error handling - Consistent error responses

**Update Existing Routes:**

- `PUT /api/vendors/:id/ai-prompts` - Change from `requireRole('admin')` to `requireVendorAccess`
- `GET /api/vendors/:id/order-settings` - Add `orderPrefix` and `minimumOrderValue` fields
- `PUT /api/vendors/:id/order-settings` - Add `orderPrefix` and `minimumOrderValue` fields

## Phase 2: Frontend Core Components (5-6 days)

### Step 2.1: Project Structure

**Files to Create:**

```javascript
frontend_v2/apps/web-vendor/src/
├── pages/Settings.tsx
├── components/settings/
│   ├── SettingsLayout.tsx
│   ├── SettingsHeader.tsx
│   ├── SettingsTabs.tsx
│   ├── SettingsContent.tsx
│   ├── SettingsFooter.tsx
│   ├── FormField.tsx (reusable)
│   ├── Tooltip.tsx (reusable)
│   ├── HelpText.tsx (reusable)
│   ├── Note.tsx (reusable)
│   ├── ConfirmationDialog.tsx
│   └── tabs/
│       ├── AccountBusinessTab.tsx
│       ├── AIConfigTab.tsx
│       ├── OrderSettingsTab.tsx
│       ├── NotificationsTab.tsx
│       └── AdvancedTab.tsx
├── hooks/settings/
│   ├── useVendorSettings.ts
│   ├── useSettingsForm.ts
│   └── useAutoSave.ts
├── api/settings.ts
└── types/settings.ts
```

### Step 2.2: API Client Layer

**File:** `frontend_v2/apps/web-vendor/src/api/settings.ts`

**Implementation Pattern:**

- Follow existing API client pattern
- Use fetch or existing HTTP client
- Include proper error handling
- Type-safe with TypeScript

**Functions:**

```typescript
export async function getBusinessInfo(vendorId: string): Promise<BusinessInfo>
export async function updateBusinessInfo(vendorId: string, data: BusinessInfoUpdate): Promise<BusinessInfo>
export async function sendPhoneVerification(vendorId: string, phone: string): Promise<{ sessionInfo: string }>
export async function confirmPhoneVerification(vendorId: string, sessionInfo: string, code: string): Promise<void>
// ... similar for other endpoints
```

### Step 2.3: Type Definitions

**File:** `frontend_v2/apps/web-vendor/src/types/settings.ts`

**Implementation Pattern:**

- Match backend Prisma types
- Export types for all settings sections
- Include form data types
- Include API response types

### Step 2.4: Validation Schemas

**File:** `frontend_v2/apps/web-vendor/src/lib/validation/settingsSchemas.ts`

**Implementation Pattern:**

- Create Zod schemas matching backend schemas
- Export schemas for React Hook Form
- Include all validation rules from documentation

**Schemas:**

- Same as backend schemas (can be shared if monorepo supports it)

### Step 2.5: Custom Hooks

**File:** `frontend_v2/apps/web-vendor/src/hooks/settings/useVendorSettings.ts`

**Implementation Pattern:**

- **Note**: `useProductForm.ts` uses useState pattern, but for settings we'll use React Hook Form + TanStack Query for better form management
- Use TanStack Query for data fetching (`useQuery`, `useMutation`)
- Use React Hook Form (`useForm`) with Zod resolver for form state and validation
- Handle loading, error, and success states
- Follow existing API client patterns from the codebase

**Hook Structure:**

```typescript
export function useVendorSettings(vendorId: string) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['vendor', vendorId, 'settings'],
    queryFn: () => fetchVendorSettings(vendorId),
  });

  const form = useForm({
    resolver: zodResolver(settingsSchema),
    defaultValues: data,
  });

  const mutation = useMutation({
    mutationFn: updateVendorSettings,
    onSuccess: () => {
      queryClient.invalidateQueries(['vendor', vendorId, 'settings']);
    },
  });

  return { form, isLoading, error, submit: form.handleSubmit(mutation.mutate) };
}
```

**File:** `frontend_v2/apps/web-vendor/src/hooks/settings/useAutoSave.ts`

**Implementation Pattern:**

- Save form state to localStorage
- Debounce saves (every 30 seconds or on blur)
- Restore on page load with confirmation
- Clear on successful save

### Step 2.6: Reusable Components

**FormField Component:**

- Wraps input with label, tooltip, help text, error message
- Supports all input types (text, textarea, select, toggle, etc.)
- Consistent styling with TailwindCSS

**Tooltip Component:**

- Accessible tooltip implementation
- Shows on hover/focus
- Contains field-specific help text

**ConfirmationDialog Component:**

- Modal dialog for confirmation
- Shows change summary
- Handles confirm/cancel actions

### Step 2.7: Tab Components

**Implementation Pattern:**

- Each tab is a separate component
- Uses `useVendorSettings` hook or tab-specific hook
- Form managed by React Hook Form
- Validation with Zod schemas
- Inline error display
- Confirmation dialog before save

**Tab Structure:**

```typescript
export function AccountBusinessTab({ vendorId }: { vendorId: string }) {
  const { form, isLoading, submit } = useAccountBusinessSettings(vendorId);
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <form onSubmit={form.handleSubmit(() => setShowConfirm(true))}>
      {/* Form fields */}
      <ConfirmationDialog
        open={showConfirm}
        onConfirm={() => { submit(); setShowConfirm(false); }}
        onCancel={() => setShowConfirm(false)}
      />
    </form>
  );
}
```

## Phase 3: Integration & Polish (2-3 days)

### Step 3.1: Route Integration

**File:** `frontend_v2/apps/web-vendor/src/App.tsx`

**Add Route:**

```typescript
<Route path="/settings" element={<Settings />} />
```

**Navigation:** Already exists in Sidebar.tsx

### Step 3.2: Error Handling

**Implementation:**

- Toast notifications for API errors
- Inline errors for validation
- Error boundaries for unexpected errors
- Retry logic for network errors

### Step 3.3: Loading States

**Implementation:**

- Skeleton loaders for initial data fetch
- Loading spinners for form submission
- Disable form during submission
- Optimistic updates where appropriate

### Step 3.4: Accessibility

**Implementation:**

- ARIA labels on all form fields
- Keyboard navigation support
- Focus management
- Screen reader support
- Color contrast compliance

### Step 3.5: Testing

**Backend Tests:**

- Unit tests for services
- Integration tests for routes
- Test rate limiting
- Test authorization

**Frontend Tests:**

- Component tests for form fields
- Hook tests for custom hooks
- Integration tests for form submission
- E2E tests for complete flows

## Implementation Checklist

### Backend

- [ ] Create verification services
- [ ] Create rate limiting middleware
- [ ] Create validation schemas
- [ ] Create verification routes
- [ ] Update vendors routes with new endpoints
- [ ] Update existing endpoints (ai-prompts, order-settings)
- [ ] Add error handling
- [ ] Write tests

### Frontend

- [ ] Create project structure
- [ ] Create API client functions
- [ ] Create type definitions
- [ ] Create validation schemas
- [ ] Create custom hooks
- [ ] Create reusable components
- [ ] Create tab components
- [ ] Implement auto-save
- [ ] Add route integration
- [ ] Add error handling
- [ ] Add loading states
- [ ] Add accessibility features
- [ ] Write tests

## Code Quality Guidelines

1. **TypeScript**: Strict mode, no `any` types
2. **Error Handling**: Consistent error types and messages
3. **Validation**: Zod schemas shared between frontend and backend
4. **Testing**: Unit tests for services/hooks, integration tests for routes/components
5. **Documentation**: JSDoc comments for public functions
6. **Code Style**: Follow existing codebase patterns

## Success Criteria

- All 5 tabs functional
- Phone/email verification working
- Auto-save working
- Confirmation dialogs working
- Inline validation working
- Rate limiting working
- Authorization working
- Mobile responsive
- Accessible
- Tested

## Timeline

- **Phase 1 (Backend)**: 3-4 days

**Estimated Duration**: 10-14 days total

- Phase 1 (Backend): 3-4 days
- Phase 2 (Frontend): 5-6 days  
- Phase 3 (Integration & Polish): 2-3 days

## ⚠️ Important Notes Before Implementation

### 1. Verification Session Storage

- **Decision**: Use Redis for verification sessions (not in-memory like `phoneAuth.ts`)
- **Rationale**: Better scalability, survives server restarts, shared across instances
- **Fallback**: Graceful degradation to in-memory if Redis unavailable

### 2. Frontend Form Pattern

- **Decision**: Use React Hook Form + TanStack Query (not useState like `useProductForm.ts`)
- **Rationale**: Better form validation, better integration with API calls, more maintainable
- **Note**: This differs from `useProductForm.ts` pattern but is more appropriate for settings forms

### 3. Confirmation Dialogs

- **From OPEN_QUESTIONS.md**: Confirmation for ALL changes is approved
- **Consideration**: May frustrate users - consider starting with critical changes only, expand if needed
- **Critical changes**: Phone/email, AI model, Order prefix

### 4. Settings Templates & Mobile App

- **From OPEN_QUESTIONS.md**: Both approved for MVP
- **Consideration**: These add significant time (5-8 days). Consider phasing:
  - Phase 1: Core settings (no templates, web only)
  - Phase 2: Templates + Mobile app

### 5. Prerequisites Verified ✅

- ✅ `requireVendorAccess` middleware exists
- ✅ `dashboardStatsRateLimit` pattern exists and can be reused
- ✅ Redis client utilities exist (`getRedisClient`, `getCached`, `setCached`)
- ✅ Zod validation pattern established in routes
- ✅ Error handling patterns established

## Ready for Implementation? ✅ YES (with above considerations)