# Account & Business Tab - Detailed Documentation

> **📚 Related Documentation**: [API Documentation](./API_DOCUMENTATION.md#1-business-information-apis) | [UI/UX Specifications](./UI_UX_SPECIFICATIONS.md) | [Quick Reference](./QUICK_REFERENCE.md)

## Overview

The Account & Business tab allows vendors to view and manage their basic business information, contact details, and view their subscription status. This is typically the first tab users see and contains foundational information about their account.

## Purpose

Enable vendors to:
- Update their business name and contact information
- View their subscription plan and status
- Set their business category
- Understand their account status and wallet balance

> **Implementation status (verified against code, Sep 2026)**: `frontend_v2/apps/web-vendor/src/components/settings/tabs/AccountBusinessTab.tsx` implements Business Name, Phone Number (with a live OTP verification flow via `/verify-phone/send|confirm`), Email (with a live verification flow via `/verify-email/send|confirm`), and Category. Two things differ from the spec below: (1) **Category is a free-text field**, not the 4-option dropdown described in Section 1 — the backend schema (`businessInfoSchema` in both `backend/src/utils/validation/settingsSchemas.ts` and the frontend mirror) validates it as `z.string().max(100)`, not an enum; and (2) **Section 3 "Subscription Information" (plan badge, status badge, wallet balance, recharge link) was never built into this tab** — there's no such section in the shipped component. `GET /api/vendors/:id/config` does still return `plan`/`status`/`walletBalance` if another part of the UI wants to surface it.

## Sections

### 1. Business Information

#### Business Name
- **Field Type**: Text Input
- **Required**: Yes
- **Validation**: 
  - Minimum length: 1 character
  - Maximum length: 100 characters
  - Cannot be empty
- **Editable**: Yes (vendor can edit)
- **Help Text**: "Enter your business name as it appears to customers. This name is used in conversations, order confirmations, and customer communications. Maximum 100 characters."
- **Tooltip**: "This is your business name as it appears to customers in conversations and order confirmations. Choose a name that customers will recognize."
- **Placeholder**: "Enter your business name"
- **Character Count**: Show "X / 100 characters"
- **API Field**: `businessName`

#### Business Category
- **Field Type**: Select Dropdown
- **Required**: No (optional)
- **Options**: 
  - "food" - Food & Beverage
  - "retail" - Retail & E-commerce
  - "service" - Services
  - "other" - Other
- **Default**: None (null)
- **Help Text**: "Select the category that best describes your business. This helps optimize AI responses and product matching for your business type."
- **Tooltip**: "Selecting a category helps us optimize AI responses for your business type. This affects product matching and conversation flow."
- **API Field**: `category`

### 2. Contact Information

#### Phone Number
- **Field Type**: Text Input (tel)
- **Required**: Yes
- **Validation**:
  - Valid phone number format (E.164 or local format)
  - Must be unique (backend validation)
  - Cannot be empty
- **Editable**: Yes (with confirmation)
- **Help Text**: "Your business phone number in international format (e.g., +919876543210). This number is used for account verification and important notifications. Changing this number requires verification."
- **Tooltip**: "Your business phone number. This is used for account verification and important system notifications. Changing this number requires verification."
- **Placeholder**: "+91 9876543210"
- **Example**: "+919876543210"
- **API Field**: `phone`
- **Note Component**: "⚠️ Warning: Changing your phone number requires verification. You'll receive a verification code to confirm the new number."

#### Email Address
- **Field Type**: Text Input (email)
- **Required**: Yes
- **Validation**:
  - Valid email format
  - Must be unique (backend validation)
  - Cannot be empty
- **Editable**: Yes
- **Help Text**: "Your business email address. Used for account notifications, password recovery, and important system updates. Must be a valid, unique email address."
- **Tooltip**: "Your business email address. Used for account notifications, password recovery, and important updates. Must be unique."
- **Placeholder**: "business@example.com"
- **Example**: "contact@yourbusiness.com"
- **API Field**: `email`

### 3. Subscription Information (Read-Only)

#### Current Plan
- **Field Type**: Display Badge/Text
- **Editable**: No
- **Display**: 
  - Plan name (e.g., "Starter", "Pro", "Business", "Enterprise")
  - Plan badge with color coding
- **Help Text**: "Your current subscription plan. This determines available features and usage limits."
- **Tooltip**: "Your current subscription plan determines features and limits. To upgrade or change plans, contact support or visit the Billing page."
- **API Field**: `subscriptionPlan`
- **Note Component**: "ℹ️ Note: Plan changes must be done through admin or billing page. Contact support for plan upgrades."

#### Subscription Status
- **Field Type**: Status Badge
- **Editable**: No
- **Status Values**:
  - "active" - Green badge
  - "suspended" - Yellow badge
  - "cancelled" - Red badge
  - "expired" - Gray badge
- **Help Text**: "Your current subscription status. Active subscriptions have full access to all features."
- **Tooltip**: "Your subscription status indicates whether your account is active and has access to features. Contact support if your status is not 'active'."
- **API Field**: `subscriptionStatus`

#### Wallet Balance
- **Field Type**: Display (Currency)
- **Editable**: No
- **Display Format**: "₹1,234.56" (Indian Rupees)
- **API Field**: `walletBalance` (stored in paise, displayed in rupees)
- **Help Text**: "Your current wallet balance. This balance is used to pay for AI message processing. Each message costs approximately ₹0.002. Recharge through the Billing page."
- **Tooltip**: "Your wallet balance is used to pay for AI message processing. Each message costs approximately ₹0.002. Recharge through the Billing page."
- **Action**: Link to Billing page with button "Recharge Wallet"
- **Note Component**: "ℹ️ Note: Low balance may affect AI message processing. Keep your wallet topped up to ensure uninterrupted service."

## Form Layout

```
┌─────────────────────────────────────────────────────────┐
│ Account & Business                                      │
│                                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Business Information                                  │ │
│ │ ─────────────────────────────────────────────────── │ │
│ │                                                       │ │
│ │ Business Name *                                       │ │
│ │ [________________________________]                   │ │
│ │ The name of your business as it appears to customers│ │
│ │                                                       │ │
│ │ Business Category                                    │ │
│ │ [Select category ▼]                                  │ │
│ │ Select the category that best describes your business│ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Contact Information                                  │ │
│ │ ─────────────────────────────────────────────────── │ │
│ │                                                       │ │
│ │ Phone Number *                                       │ │
│ │ [________________________________]                   │ │
│ │ Your business phone number                           │ │
│ │                                                       │ │
│ │ Email Address *                                      │ │
│ │ [________________________________]                   │ │
│ │ Your business email address                          │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Subscription Information                             │ │
│ │ ─────────────────────────────────────────────────── │ │
│ │                                                       │ │
│ │ Current Plan                                         │ │
│ │ [Pro] (badge)                                        │ │
│ │                                                       │ │
│ │ Subscription Status                                  │ │
│ │ [Active] (green badge)                               │ │
│ │                                                       │ │
│ │ Wallet Balance                                       │ │
│ │ ₹5,000.00                                            │ │
│ │ [View Billing →]                                     │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Validation Schema (Zod)

```typescript
import { z } from 'zod';

export const businessInfoSchema = z.object({
  businessName: z
    .string()
    .min(1, 'Business name is required')
    .max(100, 'Business name must be 100 characters or less'),
  
  category: z
    .enum(['food', 'retail', 'service', 'other'])
    .optional()
    .nullable(),
  
  phone: z
    .string()
    .min(1, 'Phone number is required')
    .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format'),
  
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email format'),
});
```

## API Endpoints

### GET `/api/vendors/:id/config`
**Purpose**: Fetch vendor configuration including business info

**Response**:
```json
{
  "id": "vendor-uuid",
  "businessName": "Brownie Bakery",
  "phone": "+919876543210",
  "email": "contact@browniebakery.com",
  "category": "food",
  "subscriptionPlan": "Pro",
  "subscriptionStatus": "active",
  "walletBalance": 500000
}
```

### PUT `/api/vendors/:id/business-info`
**Purpose**: Update business information

**Request Body**:
```json
{
  "businessName": "Brownie Bakery",
  "category": "food",
  "phone": "+919876543210",
  "email": "contact@browniebakery.com"
}
```

**Response**:
```json
{
  "id": "vendor-uuid",
  "businessName": "Brownie Bakery",
  "category": "food",
  "phone": "+919876543210",
  "email": "contact@browniebakery.com",
  "updatedAt": "2024-12-28T10:00:00Z"
}
```

**Error Responses**:
- `400`: Validation error (invalid format, duplicate email/phone)
- `403`: Unauthorized (vendor trying to edit another vendor's info)
- `404`: Vendor not found

## Component Implementation Details

### AccountTab Component

```typescript
interface AccountTabProps {
  vendorId: string;
}

export function AccountTab({ vendorId }: AccountTabProps) {
  const { data, isLoading, error } = useVendorSettings(vendorId);
  const form = useForm({
    resolver: zodResolver(businessInfoSchema),
    defaultValues: data,
  });

  const onSubmit = async (values: BusinessInfoFormData) => {
    await updateBusinessInfo(vendorId, values);
    toast.success('Business information updated successfully');
  };

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <BusinessInfoForm form={form} />
      <ContactInfoForm form={form} />
      <SubscriptionInfo data={data} />
      <SettingsFooter />
    </form>
  );
}
```

### BusinessInfoForm Component

**Props**:
- `form`: React Hook Form instance
- `disabled?: boolean`: Disable editing

**Features**:
- Real-time validation
- Error messages below fields
- Character count for business name

### ContactInfoForm Component

**Props**:
- `form`: React Hook Form instance
- `disabled?: boolean`: Disable editing

**Features**:
- Phone number formatting
- Email validation
- Confirmation dialog for phone number changes

### SubscriptionInfo Component

**Props**:
- `data`: Subscription data object
- `showWalletLink?: boolean`: Show link to billing page

**Features**:
- Read-only display
- Color-coded status badges
- Currency formatting for wallet balance

## User Interactions

### Editing Business Name
1. User clicks on business name field
2. User types new name
3. Real-time validation shows character count
4. On blur, validates format
5. Save button enables when changes detected

### Changing Category
1. User clicks category dropdown
2. User selects new category
3. Selection updates immediately
4. Save button enables

### Updating Contact Info
1. User edits phone/email
2. Format validation occurs on blur
3. If phone changed, show confirmation dialog
4. On save, backend validates uniqueness
5. If duplicate, show error message

### Viewing Subscription Info
1. User views read-only subscription section
2. Can click "View Billing" to navigate
3. Status badge color indicates account health

## Error Handling

### Validation Errors
- Display inline below each field
- Red border on invalid fields
- Error message in red text

### Server Errors
- Show toast notification with error message
- Keep form data intact
- Allow user to retry

### Network Errors
- Show retry button
- Display friendly error message
- Maintain form state

## Accessibility

- All inputs have associated labels
- Error messages are announced to screen readers
- Keyboard navigation support
- Focus management on errors
- ARIA attributes for status badges

## Mobile Responsiveness

- Full-width form fields on mobile
- Stack sections vertically
- Touch-friendly dropdowns
- Readable font sizes
- Adequate spacing between fields

## Related API Endpoints

- **GET** `/api/vendors/:id/config` - Get basic vendor configuration
- **GET/PUT** `/api/vendors/:id/business-info` - Get/update business information (built; category is validated as free text, not the enum shown above)

See [API Documentation](./API_DOCUMENTATION.md#1-business-information-apis) for complete API specifications.

## Testing Checklist

- [ ] Business name validation (min/max length)
- [ ] Category selection works
- [ ] Phone number format validation
- [ ] Email format validation
- [ ] Duplicate email/phone error handling
- [ ] Subscription info displays correctly
- [ ] Wallet balance formatting
- [ ] Save button enables on changes
- [ ] Cancel button discards changes
- [ ] Loading states display correctly
- [ ] Error states display correctly
- [ ] Mobile layout works correctly

