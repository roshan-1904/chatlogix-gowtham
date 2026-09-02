# Notifications Tab - Detailed Documentation

> **📚 Related Documentation**: [API Documentation](./API_DOCUMENTATION.md#4-notification-settings-apis) | [UI/UX Specifications](./UI_UX_SPECIFICATIONS.md) | [Quick Reference](./QUICK_REFERENCE.md)

## Overview

The Notifications tab allows vendors to configure how and when customers receive automated notifications about their orders. This includes order status updates, payment links, shipping updates, and quiet hours settings.

## Purpose

Enable vendors to:
- Control which notifications are sent automatically
- Select which order statuses trigger notifications
- Configure quiet hours to respect customer rest times
- Balance customer communication with notification preferences

> **Implementation status (verified against code, Sep 2026)**: `frontend_v2/apps/web-vendor/src/components/settings/tabs/NotificationsTab.tsx` implements only Section 1, "Notification Preferences" — the three toggles (Order Updates, Payment Links, Shipping Updates). **Section 2, "Order Status Notifications" (the per-status checkboxes), and Section 3, "Quiet Hours," were never built into the UI** — there's no `enabledStatuses` or `quietHours` control in the shipped tab. The backend fully supports both: `notificationSettingsSchema` in `backend/src/utils/validation/settingsSchemas.ts` validates `enabledStatuses` and `quietHours`, and `GET/PUT /api/vendors/:id/notification-settings` will read/write them if a client sends them — there's just no vendor-facing way to set them today.

## Sections

### 1. Notification Preferences

#### Order Updates
- **Field Type**: Toggle Switch
- **Default**: true
- **Help Text**: "Send automatic notifications to customers when their order status changes. This keeps customers informed about order progress without requiring manual updates."
- **Tooltip**: "When enabled, customers receive WhatsApp messages automatically when order status changes (confirmed, preparing, ready, etc.). This reduces support inquiries and improves customer experience."
- **When Enabled**:
  - Customers receive notifications for status changes
  - Reduces manual communication needed
  - Improves customer satisfaction
- **When Disabled**:
  - No automatic status notifications
  - You must manually inform customers
  - May increase support inquiries
- **API Field**: `notificationSettings.orderUpdates`

#### Payment Links
- **Field Type**: Toggle Switch
- **Default**: true
- **Help Text**: "Automatically send payment links to customers when orders are confirmed. This streamlines the payment process and reduces manual work."
- **Tooltip**: "When enabled, customers receive a payment link via WhatsApp immediately after order confirmation. This speeds up payment processing and reduces delays."
- **When Enabled**:
  - Payment link sent automatically on order confirmation
  - Faster payment processing
  - Reduces manual payment link sharing
- **When Disabled**:
  - You must manually send payment links
  - May delay payment processing
- **API Field**: `notificationSettings.paymentLinks`

#### Shipping Updates
- **Field Type**: Toggle Switch
- **Default**: true
- **Help Text**: "Send notifications when orders are out for delivery or delivered. This improves customer experience and reduces 'where is my order' inquiries."
- **Tooltip**: "When enabled, customers receive notifications when orders are marked as 'out for delivery' and 'delivered'. This keeps customers informed about delivery progress."
- **When Enabled**:
  - Delivery notifications sent automatically
  - Customers know when to expect delivery
  - Reduces delivery-related inquiries
- **When Disabled**:
  - No delivery notifications
  - Customers may not know delivery status
- **API Field**: `notificationSettings.shippingUpdates`

### 2. Order Status Notifications

#### Enabled Order Statuses
- **Field Type**: Multi-select Checkboxes
- **Default**: All statuses selected
- **Help Text**: "Select which order status changes trigger notifications. Only selected statuses will send notifications to customers. This helps you control notification frequency."
- **Tooltip**: "Choose which order statuses trigger notifications. For example, you might want to notify on 'confirmed' and 'delivered' but not on every status change. This prevents notification overload."
- **Options**:
  - **Confirmed** - Order has been confirmed
    - "Notify customer that order is confirmed and being processed"
  - **Preparing** - Order is being prepared
    - "Notify customer that order preparation has started"
  - **Ready** - Order is ready for pickup/delivery
    - "Notify customer that order is ready"
  - **Out for Delivery** - Order is out for delivery
    - "Notify customer that order is on the way"
  - **Delivered** - Order has been delivered
    - "Notify customer that order has been delivered"
- **API Field**: `notificationSettings.enabledStatuses` (array)

**Visual Design**:
```
┌─────────────────────────────────────────────────────────┐
│ Enabled Order Statuses                    [ℹ️]          │
│ ────────────────────────────────────────────────────── │
│ Select which order status changes trigger notifications │
│                                                          │
│ ☑ Confirmed                                             │
│   Notify customer that order is confirmed               │
│                                                          │
│ ☑ Preparing                                             │
│   Notify customer that order preparation has started    │
│                                                          │
│ ☑ Ready                                                 │
│   Notify customer that order is ready                   │
│                                                          │
│ ☑ Out for Delivery                                      │
│   Notify customer that order is on the way              │
│                                                          │
│ ☑ Delivered                                             │
│   Notify customer that order has been delivered         │
└─────────────────────────────────────────────────────────┘
```

**Note Component**:
```
ℹ️ Note: At minimum, we recommend enabling "Confirmed" and "Delivered" 
statuses to keep customers informed about order start and completion.
```

### 3. Quiet Hours

#### Enable Quiet Hours
- **Field Type**: Toggle Switch
- **Default**: false
- **Help Text**: "Prevent notifications from being sent during specified hours. This respects customer rest times and avoids sending messages too early in the morning or too late at night."
- **Tooltip**: "When enabled, notifications scheduled during quiet hours will be delayed until quiet hours end. This prevents disturbing customers during rest times."
- **When Enabled**:
  - Notifications delayed during quiet hours
  - Respects customer rest times
  - Improves customer experience
- **When Disabled**:
  - Notifications sent immediately
  - May disturb customers during rest times
- **API Field**: `notificationSettings.quietHours.enabled`

#### Quiet Hours Start Time
- **Field Type**: Time Picker
- **Required**: Yes (if quiet hours enabled)
- **Default**: "22:00" (10:00 PM)
- **Help Text**: "The time when quiet hours begin. Notifications scheduled after this time will be delayed until quiet hours end."
- **Tooltip**: "Select the time when quiet hours start. Notifications scheduled after this time will be queued and sent after quiet hours end."
- **Format**: HH:MM (24-hour format)
- **Example**: "22:00" (10:00 PM)
- **API Field**: `notificationSettings.quietHours.start`

#### Quiet Hours End Time
- **Field Type**: Time Picker
- **Required**: Yes (if quiet hours enabled)
- **Default**: "09:00" (9:00 AM)
- **Help Text**: "The time when quiet hours end. Delayed notifications will be sent after this time."
- **Tooltip**: "Select the time when quiet hours end. All queued notifications will be sent after this time."
- **Format**: HH:MM (24-hour format)
- **Example**: "09:00" (9:00 AM)
- **API Field**: `notificationSettings.quietHours.end`

**Visual Design**:
```
┌─────────────────────────────────────────────────────────┐
│ Quiet Hours                                [ℹ️]         │
│ ────────────────────────────────────────────────────── │
│ Prevent notifications during customer rest times        │
│                                                          │
│ [Toggle: ON] Enable Quiet Hours                        │
│                                                          │
│ Start Time                                              │
│ [22:00] ▼                                               │
│ The time when quiet hours begin                        │
│                                                          │
│ End Time                                                │
│ [09:00] ▼                                               │
│ The time when quiet hours end                          │
│                                                          │
│ Example: Notifications scheduled between 10 PM and     │
│ 9 AM will be delayed until 9 AM                        │
└─────────────────────────────────────────────────────────┘
```

**Warning Component** (when enabled):
```
⚠️ Warning: Quiet hours apply to all notifications. Orders confirmed 
during quiet hours will have their confirmation notifications delayed 
until quiet hours end. Consider your business hours when setting this.
```

**Example Scenarios**:
1. **Order confirmed at 11 PM** (quiet hours: 10 PM - 9 AM)
   - Notification delayed until 9 AM next day
   
2. **Order delivered at 8 AM** (quiet hours: 10 PM - 9 AM)
   - Notification delayed until 9 AM
   
3. **Order confirmed at 2 PM** (quiet hours: 10 PM - 9 AM)
   - Notification sent immediately (outside quiet hours)

## Form Layout

```
┌─────────────────────────────────────────────────────────┐
│ Notifications                                           │
│                                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Notification Preferences                              │ │
│ │ ─────────────────────────────────────────────────── │ │
│ │                                                       │ │
│ │ Order Updates                    [ℹ️] [Toggle: ON]    │ │
│ │ Send automatic notifications when order status changes│ │
│ │                                                       │ │
│ │ Payment Links                   [ℹ️] [Toggle: ON]  │ │
│ │ Automatically send payment links on order confirmation│ │
│ │                                                       │ │
│ │ Shipping Updates                [ℹ️] [Toggle: ON]  │ │
│ │ Send notifications for delivery updates              │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Order Status Notifications                          │ │
│ │ ─────────────────────────────────────────────────── │ │
│ │                                                       │ │
│ │ Enabled Order Statuses              [ℹ️]              │ │
│ │ Select which order status changes trigger notifications│ │
│ │                                                       │ │
│ │ ☑ Confirmed                                         │ │
│ │ ☑ Preparing                                         │ │
│ │ ☑ Ready                                             │ │
│ │ ☑ Out for Delivery                                  │ │
│ │ ☑ Delivered                                         │ │
│ │                                                       │ │
│ │ ℹ️ Note: At minimum, we recommend enabling           │ │
│ │ "Confirmed" and "Delivered" statuses                  │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Quiet Hours                                          │ │
│ │ ─────────────────────────────────────────────────── │ │
│ │                                                       │ │
│ │ [Toggle: OFF] Enable Quiet Hours                     │ │
│ │ Prevent notifications during customer rest times     │ │
│ │                                                       │ │
│ │ [Conditional fields when enabled]                    │ │
│ │                                                       │ │
│ │ Start Time: [22:00]                                  │ │
│ │ End Time: [09:00]                                    │ │
│ │                                                       │ │
│ │ Example: Notifications scheduled between 10 PM and   │ │
│ │ 9 AM will be delayed until 9 AM                      │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Validation Schema (Zod)

```typescript
import { z } from 'zod';

const orderStatusSchema = z.enum([
  'confirmed',
  'preparing',
  'ready',
  'out_for_delivery',
  'delivered',
]);

const timeSchema = z
  .string()
  .regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)');

export const notificationSettingsSchema = z.object({
  orderUpdates: z.boolean().default(true),
  paymentLinks: z.boolean().default(true),
  shippingUpdates: z.boolean().default(true),
  enabledStatuses: z
    .array(orderStatusSchema)
    .min(1, 'At least one order status must be enabled')
    .default(['confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered']),
  quietHours: z
    .object({
      enabled: z.boolean().default(false),
      start: timeSchema.optional(),
      end: timeSchema.optional(),
    })
    .refine(
      (data) => {
        if (data.enabled) {
          return data.start !== undefined && data.end !== undefined;
        }
        return true;
      },
      { message: 'Start and end times are required when quiet hours are enabled' }
    )
    .refine(
      (data) => {
        if (data.enabled && data.start && data.end) {
          return data.start !== data.end;
        }
        return true;
      },
      { message: 'Start and end times must be different' }
    )
    .default({ enabled: false }),
});
```

## API Endpoints

### GET `/api/vendors/:id/notification-settings`
**Purpose**: Fetch notification settings

**Response**:
```json
{
  "orderUpdates": true,
  "paymentLinks": true,
  "shippingUpdates": true,
  "enabledStatuses": [
    "confirmed",
    "preparing",
    "ready",
    "out_for_delivery",
    "delivered"
  ],
  "quietHours": {
    "enabled": false,
    "start": "22:00",
    "end": "09:00"
  }
}
```

### PUT `/api/vendors/:id/notification-settings`
**Purpose**: Update notification settings

**Request Body**:
```json
{
  "orderUpdates": true,
  "paymentLinks": true,
  "shippingUpdates": true,
  "enabledStatuses": [
    "confirmed",
    "delivered"
  ],
  "quietHours": {
    "enabled": true,
    "start": "22:00",
    "end": "09:00"
  }
}
```

**Response**:
```json
{
  "orderUpdates": true,
  "paymentLinks": true,
  "shippingUpdates": true,
  "enabledStatuses": [
    "confirmed",
    "delivered"
  ],
  "quietHours": {
    "enabled": true,
    "start": "22:00",
    "end": "09:00"
  }
}
```

**Error Responses**:
- `400`: Validation error (invalid time format, no statuses selected)
- `403`: Unauthorized
- `404`: Vendor not found

## Component Implementation Details

### NotificationsTab Component

```typescript
interface NotificationsTabProps {
  vendorId: string;
}

export function NotificationsTab({ vendorId }: NotificationsTabProps) {
  const { data, isLoading, error } = useNotificationSettings(vendorId);
  const form = useForm({
    resolver: zodResolver(notificationSettingsSchema),
    defaultValues: data,
  });

  const quietHoursEnabled = form.watch('quietHours.enabled');

  const onSubmit = async (values: NotificationSettingsFormData) => {
    await updateNotificationSettings(vendorId, values);
    toast.success('Notification settings updated successfully');
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <NotificationPreferencesSection form={form} />
      <OrderStatusNotificationsSection form={form} />
      <QuietHoursSection 
        form={form} 
        enabled={quietHoursEnabled}
      />
      <SettingsFooter />
    </form>
  );
}
```

### OrderStatusCheckbox Component

**Props**:
- `status`: Order status value
- `label`: Display label
- `description`: Help text
- `checked`: Whether checked
- `onChange`: Change handler

**Features**:
- Large clickable area
- Checkbox with label
- Description text below
- Visual feedback on hover

### TimePicker Component

**Props**:
- `name`: Form field name
- `label`: Field label
- `helpText`: Help text
- `form`: React Hook Form instance

**Features**:
- 24-hour format (HH:MM)
- Dropdown or native time input
- Validation for valid time
- Visual time display

## User Interactions

### Enabling/Disabling Notifications
1. User toggles notification preference
2. Toggle animates smoothly
3. Help text updates to show impact
4. Save button enables when changes detected

### Selecting Order Statuses
1. User clicks checkbox for status
2. Checkbox toggles state
3. Visual feedback (checkmark)
4. If all unchecked, show warning
5. Save button enables when changes detected

### Configuring Quiet Hours
1. User enables quiet hours toggle
2. Time picker fields appear
3. User selects start time (e.g., 22:00)
4. User selects end time (e.g., 09:00)
5. Example scenario updates
6. Validation ensures times are different
7. Save button enables when valid

## Business Logic

### Notification Sending
- Check if notification type is enabled
- Check if order status is in enabledStatuses
- Check if current time is within quiet hours
- If in quiet hours and quiet hours enabled → Queue notification
- Send notification after quiet hours end
- If outside quiet hours → Send immediately

### Quiet Hours Logic
```typescript
function shouldDelayNotification(quietHours: QuietHoursConfig): boolean {
  if (!quietHours.enabled) return false;
  
  const now = new Date();
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  
  // Handle overnight quiet hours (e.g., 22:00 - 09:00)
  if (quietHours.start > quietHours.end) {
    // Quiet hours span midnight
    return currentTime >= quietHours.start || currentTime < quietHours.end;
  } else {
    // Quiet hours within same day
    return currentTime >= quietHours.start && currentTime < quietHours.end;
  }
}
```

## Error Handling

### Validation Errors
- No statuses selected: Show error, disable save
- Invalid time format: Show format error
- Start/end times same: Show error message
- Quiet hours enabled without times: Show error

### Server Errors
- Show toast with error message
- Maintain form state
- Allow retry

## Accessibility

- All toggles have labels
- Checkboxes properly grouped
- Time pickers accessible via keyboard
- Screen reader announcements
- Focus management

## Mobile Responsiveness

- Full-width toggles
- Stack checkboxes vertically
- Touch-friendly time pickers
- Readable font sizes
- Adequate spacing

## Related API Endpoints

- **GET** `/api/vendors/:id/notification-settings` - Get notification settings (built; supports `enabledStatuses` and `quietHours` even though no UI exposes them — see status note above)
- **PUT** `/api/vendors/:id/notification-settings` - Update notification settings (built; same caveat)

See [API Documentation](./API_DOCUMENTATION.md#4-notification-settings-apis) for complete API specifications.

## Testing Checklist

- [ ] Order updates toggle works
- [ ] Payment links toggle works
- [ ] Shipping updates toggle works
- [ ] Order status checkboxes work
- [ ] At least one status must be selected
- [ ] Quiet hours toggle works
- [ ] Time pickers work correctly
- [ ] Quiet hours validation (start ≠ end)
- [ ] Quiet hours overnight logic works
- [ ] Save button enables on changes
- [ ] Form validation works
- [ ] Error handling works
- [ ] Mobile layout works

