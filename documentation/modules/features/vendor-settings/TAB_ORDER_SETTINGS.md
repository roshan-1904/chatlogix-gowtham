# Order Settings Tab - Detailed Documentation

> **📚 Related Documentation**: [API Documentation](./API_DOCUMENTATION.md#3-order-settings-apis) | [UI/UX Specifications](./UI_UX_SPECIFICATIONS.md) | [Quick Reference](./QUICK_REFERENCE.md)

## Overview

The Order Settings tab allows vendors to configure how orders are processed, including order numbering, minimum order values, delivery preferences, and preparation time configurations. This tab directly impacts the order placement flow and customer experience.

## Purpose

Enable vendors to:
- Customize order numbering with prefixes
- Set minimum order values
- Configure delivery date preferences
- Set up flexible preparation time configurations
- Control order processing behavior

> **Implementation status (verified against code, Sep 2026)**: `frontend_v2/apps/web-vendor/src/components/settings/tabs/OrderSettingsTab.tsx` implements Order Prefix, Minimum Order Value, Category (free text), and the "Ask for Preferred Delivery Date" checkbox (Sections 1-2 below). **Section 3, "Preparation Time Configuration" (the type radio group and its per-type fields), was never built in the UI** — there's no `orderPreparationConfig.type` control in the shipped tab, even though the backend (`PUT /api/vendors/:id/order-settings` in `backend/src/routes/vendors.ts`) does validate and store `orderPreparationConfig` if sent directly. Also note the Order Prefix validation actually implemented (`backend/src/utils/validation/settingsSchemas.ts`) is `z.string().max(5).regex(/^[A-Z0-9]*$/)` — **up to 5 uppercase letters or digits, not exactly 5 letters-only** as this doc's Section 1 and validation schema describe.

## Sections

### 1. Order Configuration

#### Order Prefix
- **Field Type**: Text Input (uppercase)
- **Required**: No (optional)
- **Validation**:
  - Length: Exactly 5 characters (if provided)
  - Format: Letters only (A-Z)
  - Must be uppercase
  - Cannot contain spaces or special characters
- **Help Text**: "A 5-letter uppercase prefix for your order numbers. This makes orders easier to identify and reference. Once set, it applies to all future orders. Existing orders keep their original prefix. Example: 'VENDI' creates orders like 'VENDI-20241228-001'."
- **Tooltip**: "A 5-letter prefix for your order numbers. This makes orders easier to identify. Once set, it applies to all future orders. Example: 'VENDI' creates orders like 'VENDI-20241228-001'."
- **Placeholder**: "VENDI"
- **Example Component**: 
  ```
  Example: "VENDI" → VENDI-20241228-001
  Format: {PREFIX}-{YYYYMMDD}-{SEQUENCE}
  ```
- **Character Count**: Show "X / 5 characters"
- **API Field**: `orderPrefix`
- **Note Component**: "ℹ️ Note: Once set, changing prefix affects future orders only. Existing orders keep their original prefix."

**Order Number Format**: `{PREFIX}-{YYYYMMDD}-{SEQUENCE}`
- Example: `VENDI-20241228-001`
- Example: `BAKER-20241228-042`

#### Minimum Order Value
- **Field Type**: Number Input (currency)
- **Required**: No (optional - null means no minimum)
- **Validation**:
  - Minimum: 0
  - Must be positive integer (in paise)
  - Display in rupees, store in paise
- **Help Text**: "Set a minimum order value in rupees. Orders below this amount will be rejected with an error message asking customers to add more items. Leave empty for no minimum. This helps ensure orders are worth processing and covers delivery costs."
- **Tooltip**: "Set a minimum order value in rupees. Orders below this amount will be rejected with an error message. Leave empty for no minimum. This helps ensure orders are worth processing."
- **Placeholder**: "500"
- **Unit Display**: "₹" (rupees)
- **Conversion**: Display in rupees, API expects paise
- **Example Component**: 
  ```
  Example: Enter "500" → Stored as ₹500.00
  If order total is ₹450, customer will see:
  "Minimum order value is ₹500. Please add more items."
  ```
- **API Field**: `minimumOrderValue`
- **Note Component**: "ℹ️ Note: This helps ensure orders cover delivery costs and are worth processing. Consider your average order value when setting this."

**Business Logic**:
- If order total < minimumOrderValue → Show error message
- Error: "Minimum order value is ₹{amount}. Please add more items."

### 2. Delivery Preferences

#### Ask for Preferred Delivery Date
- **Field Type**: Toggle Switch
- **Required**: No (defaults to false)
- **Default**: false
- **Help Text**: "When enabled, the AI will ask customers for their preferred delivery date during order placement. When disabled, the AI uses only the preparation time to estimate delivery."
- **Tooltip**: "When enabled, the AI will ask customers for their preferred delivery date during order placement. When disabled, the AI uses only the preparation time to estimate delivery."
- **When Enabled**:
  - AI asks: "When would you like this delivered?"
  - Customer can specify date/time
  - System validates date is feasible
- **When Disabled**:
  - AI uses only preparation time
  - No delivery date question
- **API Field**: `askForPreferredDeliveryDate`
- **Note Component**: "ℹ️ Note: Enabling this gives customers more control over delivery timing, which can improve customer satisfaction."

### 3. Preparation Time Configuration

This section allows flexible configuration of how preparation time is calculated for orders.

#### Preparation Time Type
- **Field Type**: Radio Button Group
- **Required**: Yes (if preparation config is set)
- **Options**:
  1. **after_order** - Time starts counting after order confirmation
     - Description: "Preparation time starts after order is confirmed"
     - Use Case: Most businesses, standard preparation workflow
  2. **fixed_minutes** - Fixed number of minutes regardless of order time
     - Description: "Same preparation time for all orders"
     - Use Case: Simple businesses with consistent prep time
  3. **variable** - Variable time based on order complexity
     - Description: "Time adjusts based on number of items"
     - Use Case: Complex orders, restaurants, custom items
  4. **ready_to_ship** - Items are ready to ship immediately
     - Description: "No preparation needed, ready immediately"
     - Use Case: Pre-made items, retail products, digital products
- **Default**: "after_order"
- **Help Text**: "Choose how preparation time is calculated for orders. Each option has different use cases and configuration requirements."
- **Tooltip**: "Choose how preparation time is calculated. 'After Order' starts counting when order is confirmed. 'Fixed Minutes' uses the same time for all orders. 'Variable' adjusts based on order complexity. 'Ready to Ship' means no preparation needed."
- **API Field**: `orderPreparationConfig.type`

#### Configuration by Type

##### Type: after_order
- **Description**: Preparation time starts after order is confirmed
- **Additional Fields**: None
- **Use Case**: Most businesses, standard preparation workflow
- **Example**: Order confirmed at 2 PM, 60 min prep → Ready at 3 PM

##### Type: fixed_minutes
- **Description**: Fixed preparation time regardless of when order is placed
- **Additional Fields**:
  - **Fixed Minutes** (required)
    - Type: Number Input
    - Validation: Positive integer, minimum 0
    - Help Text: "Fixed preparation time in minutes"
- **API Field**: `orderPreparationConfig.fixedMinutes`
- **Use Case**: Simple businesses with consistent prep time
- **Example**: Always 45 minutes, regardless of order time

##### Type: variable
- **Description**: Variable preparation time based on order complexity
- **Additional Fields**:
  - **Base Minutes** (required)
    - Type: Number Input
    - Validation: Positive integer
    - Help Text: "Base preparation time in minutes"
  - **Minutes Per Item** (optional)
    - Type: Number Input
    - Validation: Positive number (can be decimal)
    - Help Text: "Additional minutes per item"
  - **Maximum Minutes** (optional)
    - Type: Number Input
    - Validation: Positive integer
    - Help Text: "Maximum preparation time cap"
- **API Fields**: 
  - `orderPreparationConfig.baseMinutes`
  - `orderPreparationConfig.minutesPerItem`
  - `orderPreparationConfig.maxMinutes`
- **Use Case**: Complex orders, restaurants, custom items
- **Example**: Base 30 min + 5 min per item, max 120 min
  - 1 item: 35 min
  - 5 items: 55 min
  - 20 items: 120 min (capped)

##### Type: ready_to_ship
- **Description**: Items are ready to ship immediately (no preparation needed)
- **Additional Fields**: None
- **Use Case**: Pre-made items, retail products, digital products
- **Example**: Order confirmed → Ready immediately

#### Legacy Field: Preparation Time Minutes
- **Field Type**: Number Input
- **Required**: No (optional)
- **Purpose**: Backward compatibility with old system
- **Note**: If `orderPreparationConfig` is set, this field is ignored
- **API Field**: `aiPreparationTimeMinutes`
- **Migration**: Old value can be migrated to `orderPreparationConfig.fixedMinutes`

## Form Layout

```
┌─────────────────────────────────────────────────────────┐
│ Order Settings                                           │
│                                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Order Configuration                                   │ │
│ │ ─────────────────────────────────────────────────── │ │
│ │                                                       │ │
│ │ Order Prefix                                         │ │
│ │ [VENDI] (5 letters, uppercase)                      │ │
│ │ A 5-letter prefix for your order numbers            │ │
│ │                                                       │ │
│ │ Minimum Order Value                                  │ │
│ │ ₹ [500]                                              │ │
│ │ Minimum order value in rupees                       │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Delivery Preferences                                 │ │
│ │ ─────────────────────────────────────────────────── │ │
│ │                                                       │ │
│ │ Ask for Preferred Delivery Date                     │ │
│ │ [Toggle: ON/OFF]                                    │ │
│ │ When enabled, AI will ask customers for delivery date│ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Preparation Time Configuration                       │ │
│ │ ─────────────────────────────────────────────────── │ │
│ │                                                       │ │
│ │ Preparation Time Type                                │ │
│ │ ○ After Order Confirmation                          │ │
│ │ ○ Fixed Minutes                                     │ │
│ │ ○ Variable (based on order complexity)              │ │
│ │ ○ Ready to Ship (immediate)                         │ │
│ │                                                       │ │
│ │ [Conditional Fields Based on Selection]              │ │
│ │                                                       │ │
│ │ If "Fixed Minutes" selected:                        │ │
│ │   Fixed Minutes: [60] minutes                       │ │
│ │                                                       │ │
│ │ If "Variable" selected:                             │ │
│ │   Base Minutes: [30]                                │ │
│ │   Minutes Per Item: [5]                             │ │
│ │   Maximum Minutes: [120]                            │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Validation Schema (Zod)

```typescript
import { z } from 'zod';

// Order prefix validation
const orderPrefixSchema = z
  .string()
  .regex(/^[A-Z]{5}$/, 'Order prefix must be exactly 5 uppercase letters')
  .optional()
  .nullable();

// Minimum order value schema
const minimumOrderValueSchema = z
  .number()
  .int('Minimum order value must be a whole number')
  .min(0, 'Minimum order value cannot be negative')
  .optional()
  .nullable();

// Preparation config schemas
const afterOrderConfigSchema = z.object({
  type: z.literal('after_order'),
});

const fixedMinutesConfigSchema = z.object({
  type: z.literal('fixed_minutes'),
  fixedMinutes: z
    .number()
    .int('Fixed minutes must be a whole number')
    .min(0, 'Fixed minutes cannot be negative')
    .max(1440, 'Fixed minutes cannot exceed 24 hours'),
});

const variableConfigSchema = z.object({
  type: z.literal('variable'),
  baseMinutes: z
    .number()
    .int('Base minutes must be a whole number')
    .min(0, 'Base minutes cannot be negative'),
  minutesPerItem: z
    .number()
    .min(0, 'Minutes per item cannot be negative')
    .optional()
    .nullable(),
  maxMinutes: z
    .number()
    .int('Max minutes must be a whole number')
    .min(0, 'Max minutes cannot be negative')
    .optional()
    .nullable(),
}).refine(
  (data) => !data.maxMinutes || data.maxMinutes >= data.baseMinutes,
  { message: 'Max minutes must be greater than or equal to base minutes' }
);

const readyToShipConfigSchema = z.object({
  type: z.literal('ready_to_ship'),
});

const orderPreparationConfigSchema = z.discriminatedUnion('type', [
  afterOrderConfigSchema,
  fixedMinutesConfigSchema,
  variableConfigSchema,
  readyToShipConfigSchema,
]);

// Main order settings schema
export const orderSettingsSchema = z.object({
  orderPrefix: orderPrefixSchema,
  minimumOrderValue: minimumOrderValueSchema,
  askForPreferredDeliveryDate: z.boolean().default(false),
  orderPreparationConfig: orderPreparationConfigSchema.optional().nullable(),
  // Legacy field
  aiPreparationTimeMinutes: z
    .number()
    .int()
    .min(0)
    .max(1440)
    .optional()
    .nullable(),
});
```

## API Endpoints

### GET `/api/vendors/:id/order-settings`
**Purpose**: Fetch order settings

**Response**:
```json
{
  "category": "food",
  "askForPreferredDeliveryDate": true,
  "orderPreparationConfig": {
    "type": "variable",
    "baseMinutes": 30,
    "minutesPerItem": 5,
    "maxMinutes": 120
  },
  "aiPreparationTimeMinutes": 60
}
```

**Note**: `aiPreparationTimeMinutes` is for backward compatibility.

### PUT `/api/vendors/:id/order-settings`
**Purpose**: Update order settings

**Request Body**:
```json
{
  "orderPrefix": "VENDI",
  "minimumOrderValue": 50000,
  "askForPreferredDeliveryDate": true,
  "orderPreparationConfig": {
    "type": "variable",
    "baseMinutes": 30,
    "minutesPerItem": 5,
    "maxMinutes": 120
  }
}
```

**Response**:
```json
{
  "id": "vendor-uuid",
  "orderPrefix": "VENDI",
  "minimumOrderValue": 50000,
  "askForPreferredDeliveryDate": true,
  "orderPreparationConfig": {
    "type": "variable",
    "baseMinutes": 30,
    "minutesPerItem": 5,
    "maxMinutes": 120
  }
}
```

**Error Responses**:
- `400`: Validation error (invalid prefix format, invalid config)
- `403`: Unauthorized
- `404`: Vendor not found

### Additional Endpoint Needed (not built — turned out unnecessary)

#### PUT `/api/vendors/:id/order-prefix`
**Status**: Never built, and not needed — `orderPrefix` is handled directly by the main `PUT /api/vendors/:id/order-settings` endpoint above (confirmed in `backend/src/routes/vendors.ts`), so a separate endpoint wasn't required.

**Purpose (as originally planned)**: Update order prefix separately (if needed)

**Request Body**:
```json
{
  "orderPrefix": "VENDI"
}
```

## Component Implementation Details

### OrderSettingsTab Component

```typescript
interface OrderSettingsTabProps {
  vendorId: string;
}

export function OrderSettingsTab({ vendorId }: OrderSettingsTabProps) {
  const { data, isLoading, error } = useOrderSettings(vendorId);
  const form = useForm({
    resolver: zodResolver(orderSettingsSchema),
    defaultValues: data,
  });

  const preparationType = form.watch('orderPreparationConfig.type');

  const onSubmit = async (values: OrderSettingsFormData) => {
    await updateOrderSettings(vendorId, values);
    toast.success('Order settings updated successfully');
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <OrderConfigurationSection form={form} />
      <DeliveryPreferencesSection form={form} />
      <PreparationTimeConfigSection 
        form={form} 
        preparationType={preparationType}
      />
      <SettingsFooter />
    </form>
  );
}
```

### OrderPrefixInput Component

**Props**:
- `form`: React Hook Form instance
- `disabled?: boolean`: Disable editing

**Features**:
- Auto-uppercase conversion
- Real-time validation
- Character count indicator (X/5)
- Format validation

**Behavior**:
- Convert input to uppercase automatically
- Limit to 5 characters
- Show error if invalid format
- Show example: "VENDI-20241228-001"

### PreparationTimeConfig Component

**Props**:
- `form`: React Hook Form instance
- `preparationType`: Current selected type

**Features**:
- Conditional field rendering based on type
- Dynamic validation
- Help text for each type
- Example calculations

**Conditional Rendering**:
```typescript
{preparationType === 'fixed_minutes' && (
  <FixedMinutesFields form={form} />
)}

{preparationType === 'variable' && (
  <VariableFields form={form} />
)}
```

### MinimumOrderValueInput Component

**Props**:
- `form`: React Hook Form instance
- `disabled?: boolean`: Disable editing

**Features**:
- Currency formatting (₹)
- Convert rupees to paise on submit
- Convert paise to rupees on load
- Validation for positive integers

## User Interactions

### Setting Order Prefix
1. User types in prefix field
2. Input automatically converts to uppercase
3. Character counter shows "3/5"
4. When 5 characters entered, validates format
5. Shows example order number: "VENDI-20241228-001"
6. Error shown if invalid characters entered

### Setting Minimum Order Value
1. User enters amount in rupees
2. Field shows "₹500"
3. On save, converts to paise (50000)
4. Validation ensures positive number
5. Help text explains impact

### Configuring Preparation Time
1. User selects preparation type (radio buttons)
2. Relevant fields appear/disappear
3. User fills in required fields
4. For "variable" type:
   - Enter base minutes
   - Optionally enter minutes per item
   - Optionally enter max minutes
   - See example calculation
5. Validation ensures logical values
6. Save button enables when valid

### Example Calculation Display (Variable Type)
```
Example Calculation:
- Order with 3 items
- Base: 30 min
- Per item: 5 min
- Total: 30 + (3 × 5) = 45 minutes
- Max cap: 120 min (not reached)
→ Estimated preparation: 45 minutes
```

## Business Logic

### Order Prefix
- Applied to new orders only
- Existing orders keep old prefix
- If not set, system generates default prefix
- Format: `{PREFIX}-{YYYYMMDD}-{SEQUENCE}`

### Minimum Order Value
- Checked during order placement
- If order total < minimum → Show error
- Error message: "Minimum order value is ₹{amount}"
- Customer can add more items or cancel

### Preparation Time Calculation

**Type: after_order**
```typescript
readyTime = orderConfirmedAt + preparationTimeMinutes
```

**Type: fixed_minutes**
```typescript
readyTime = orderConfirmedAt + fixedMinutes
```

**Type: variable**
```typescript
let totalMinutes = baseMinutes;
if (minutesPerItem) {
  totalMinutes += (itemCount * minutesPerItem);
}
if (maxMinutes && totalMinutes > maxMinutes) {
  totalMinutes = maxMinutes;
}
readyTime = orderConfirmedAt + totalMinutes;
```

**Type: ready_to_ship**
```typescript
readyTime = orderConfirmedAt // Immediate
```

### Delivery Date Preference
- When enabled: AI asks "When would you like this delivered?"
- Customer can specify date/time
- System validates date is not in past
- System checks if date is feasible based on preparation time

## Error Handling

### Validation Errors
- Order prefix: Show format error if invalid
- Minimum value: Show error if negative
- Preparation config: Show error if required fields missing
- Variable config: Show error if max < base

### Server Errors
- Show toast with error message
- Maintain form state
- Allow retry

### Business Logic Errors
- Minimum order value: Show in order flow, not settings
- Invalid date: Handle in order placement, not settings

## Accessibility

- All inputs have labels
- Radio buttons properly grouped
- Conditional fields announced to screen readers
- Keyboard navigation support
- Focus management

## Mobile Responsiveness

- Full-width inputs
- Stack radio buttons vertically on mobile
- Touch-friendly controls
- Readable font sizes
- Adequate spacing

## Related API Endpoints

- **GET** `/api/vendors/:id/order-settings` - Get order settings (already includes `orderPrefix` and `minimumOrderValue`)
- **PUT** `/api/vendors/:id/order-settings` - Update order settings (already handles `orderPrefix` and `minimumOrderValue`; note the prefix validation is "up to 5 alphanumeric uppercase chars," not "exactly 5 letters" — see status note above)

See [API Documentation](./API_DOCUMENTATION.md#3-order-settings-apis) for complete API specifications.

## Testing Checklist

- [ ] Order prefix validation (5 letters, uppercase)
- [ ] Order prefix auto-uppercase conversion
- [ ] Minimum order value validation
- [ ] Minimum order value currency formatting
- [ ] Delivery date preference toggle
- [ ] Preparation time type selection
- [ ] Fixed minutes configuration
- [ ] Variable configuration (all fields)
- [ ] Variable calculation examples
- [ ] Ready to ship configuration
- [ ] Conditional field rendering
- [ ] Form validation for each type
- [ ] Save button enables on changes
- [ ] Error handling works
- [ ] Mobile layout works

