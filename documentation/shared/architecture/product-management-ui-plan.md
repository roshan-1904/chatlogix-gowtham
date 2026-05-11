# Product Management UI Plan - Vendor Portal

## Table of Contents
1. [Overview](#overview)
2. [Page Structure](#page-structure)
3. [Component Architecture](#component-architecture)
4. [User Flows](#user-flows)
5. [Form Designs](#form-designs)
6. [Features & Functionality](#features--functionality)
7. [UI/UX Specifications](#uiux-specifications)
8. [Implementation Phases](#implementation-phases)
9. [Accessibility & Responsiveness](#accessibility--responsiveness)

---

## Overview

### Objective
Create a comprehensive product management interface in the vendor portal that allows vendors to:
- View, create, edit, and manage products
- Configure pricing, variants, and inventory
- Set minimum/maximum order quantities
- Manage AI keywords for product matching
- Upload product images
- Preview price calculations
- Bulk operations

### Key Requirements
- Intuitive and user-friendly interface
- Real-time validation and feedback
- Mobile-responsive design
- Fast and efficient product management
- Clear visual feedback for all actions
- Support for all product types (count, weight, volume, length)
- Price calculator preview
- Variant management
- Keywords management for AI matching

---

## Page Structure

### Main Products Page (`/catalog` or `/products`)

**Route**: `/catalog` (matches existing sidebar navigation)

**Layout**:
```
┌─────────────────────────────────────────────────────────┐
│ Header: "Product Catalog" + "Add Product" Button        │
├─────────────────────────────────────────────────────────┤
│ Filters Bar: [Category] [Status] [Stock] [Search]      │
├─────────────────────────────────────────────────────────┤
│ Products Table/Grid                                      │
│ ┌──────────┬──────────┬──────────┬──────────┐         │
│ │ Product  │ Price    │ Stock    │ Actions  │         │
│ │ Card/Row │          │          │          │         │
│ └──────────┴──────────┴──────────┴──────────┘         │
│                                                         │
│ [Pagination]                                            │
└─────────────────────────────────────────────────────────┘
```

**Features**:
- List view (table) and grid view (cards) toggle
- Search bar with real-time filtering
- Filter by category, status (active/inactive), stock status
- Sort by name, price, created date
- Bulk actions (activate/deactivate, delete)
- Quick actions per product (edit, duplicate, delete, view)

### Product Create/Edit Page (`/catalog/new` or `/catalog/:id/edit`)

**Layout**:
```
┌─────────────────────────────────────────────────────────┐
│ Header: "Create Product" / "Edit Product" + [Cancel]    │
├─────────────────────────────────────────────────────────┤
│ Form Sections (Tabs or Accordion):                      │
│                                                         │
│ [Basic Info] [Pricing] [Variants] [Inventory] [AI]     │
│                                                         │
│ ┌─────────────────────────────────────────────────┐     │
│ │ Basic Information                                │     │
│ │ - Product Name *                                │     │
│ │ - Description                                   │     │
│ │ - Category                                      │     │
│ │ - Image Upload                                  │     │
│ │ - Tags                                          │     │
│ └─────────────────────────────────────────────────┘     │
│                                                         │
│ ┌─────────────────────────────────────────────────┐     │
│ │ Pricing & Units                                 │     │
│ │ - Base Unit * (kg, piece, ml, etc.)            │     │
│ │ - Base Quantity *                               │     │
│ │ - Base Price * (₹)                             │     │
│ │ - Is Divisible? [Toggle]                        │     │
│ │ - Min Order Quantity                            │     │
│ │ - Max Order Quantity                            │     │
│ │ [Price Calculator Preview]                      │     │
│ └─────────────────────────────────────────────────┘     │
│                                                         │
│ ┌─────────────────────────────────────────────────┐     │
│ │ Variants (Optional)                            │     │
│ │ [+ Add Variant]                                │     │
│ │ Variant 1: [250ml] [₹440] [Divisible: No] [×] │     │
│ │ Variant 2: [900ml] [₹650] [Divisible: No] [×] │     │
│ └─────────────────────────────────────────────────┘     │
│                                                         │
│ ┌─────────────────────────────────────────────────┐     │
│ │ Inventory Management                            │     │
│ │ - Track Stock? [Toggle]                         │     │
│ │ - Stock Quantity                                │     │
│ │ - In Stock [Toggle]                             │     │
│ └─────────────────────────────────────────────────┘     │
│                                                         │
│ ┌─────────────────────────────────────────────────┐     │
│ │ AI Keywords                                     │     │
│ │ - Keywords for AI matching                      │     │
│ │ [+ Add Keyword]                                 │     │
│ │ [rose] [concentrate] [juice] [×] [×] [×]      │     │
│ │ Help: Add words customers might use             │     │
│ └─────────────────────────────────────────────────┘     │
│                                                         │
│ [Save Draft] [Cancel] [Save & Publish]                 │
└─────────────────────────────────────────────────────────┘
```

### Product Detail/View Page (`/catalog/:id`)

**Layout**:
```
┌─────────────────────────────────────────────────────────┐
│ [← Back] Product: "Rose Concentrate" [Edit] [Delete]   │
├─────────────────────────────────────────────────────────┤
│ ┌───────────────┬───────────────────────────────────┐   │
│ │ Product Image │ Product Details                   │   │
│ │               │ Name: Rose Concentrate            │   │
│ │               │ Description: ...                  │   │
│ │               │ Category: Beverages                │   │
│ │               │ Status: Active ✓                  │   │
│ └───────────────┴───────────────────────────────────┘   │
│                                                         │
│ Pricing Information                                     │
│ - Base Price: ₹440 per 250ml                           │
│ - Min Order: 1 bottle                                   │
│ - Divisible: No                                         │
│                                                         │
│ Variants                                                │
│ - 250ml: ₹440                                          │
│ - 900ml: ₹650                                          │
│                                                         │
│ Inventory                                               │
│ - Stock: 50 bottles                                    │
│ - Status: In Stock                                      │
│                                                         │
│ AI Keywords                                             │
│ [rose] [concentrate] [juice] [beverage]                │
│                                                         │
│ Usage Statistics                                        │
│ - Orders: 23                                            │
│ - Revenue: ₹12,100                                     │
│ - Last Ordered: 2 days ago                              │
└─────────────────────────────────────────────────────────┘
```

---

## Component Architecture

### Core Components

#### 1. `ProductList` Component
**File**: `frontend_v2/apps/web-vendor/src/components/products/ProductList.tsx`

**Props**:
```typescript
interface ProductListProps {
  products: Product[];
  total: number;
  page: number;
  pageSize: number;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onToggleStatus: (id: string, isActive: boolean) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  viewMode?: 'table' | 'grid';
  loading?: boolean;
}
```

**Features**:
- Table view with sortable columns
- Grid view with product cards
- Empty state with "Add Product" CTA
- Loading skeleton
- Inline actions menu
- **Pagination controls** (page numbers, page size selector)
- **Total count display** ("Showing X of Y products")

#### 2. `ProductForm` Component
**File**: `frontend_v2/apps/web-vendor/src/components/products/ProductForm.tsx`

**Props**:
```typescript
interface ProductFormProps {
  product?: Product;
  onSubmit: (data: ProductFormData) => Promise<void>;
  onCancel: () => void;
  mode: 'create' | 'edit';
}
```

**Features**:
- Multi-step form with validation
- **Real-time field-level validation** with error messages
- **Touched field tracking** (show errors only for touched fields)
- **Form-level validation** before submission
- Real-time price calculator
- Variant management
- Keywords input with autocomplete
- Image upload with preview
- Form state management
- **Success indicators** for valid fields
- **Inline error messages** below each field

#### 3. `ProductCard` Component
**File**: `frontend_v2/apps/web-vendor/src/components/products/ProductCard.tsx`

**Props**:
```typescript
interface ProductCardProps {
  product: Product;
  onEdit: () => void;
  onDelete: () => void;
  onToggleStatus: () => void;
}
```

**Features**:
- Product image display
- Key information (name, price, stock)
- Quick actions dropdown
- Status badge
- Stock indicator

#### 4. `VariantManager` Component
**File**: `frontend_v2/apps/web-vendor/src/components/products/VariantManager.tsx`

**Props**:
```typescript
interface VariantManagerProps {
  variants: Variant[];
  onChange: (variants: Variant[]) => void;
  baseUnit: string;
}
```

**Features**:
- Add/remove variants
- Variant form fields
- Validation
- Duplicate detection

#### 5. `KeywordsInput` Component
**File**: `frontend_v2/apps/web-vendor/src/components/products/KeywordsInput.tsx`

**Props**:
```typescript
interface KeywordsInputProps {
  keywords: string[];
  onChange: (keywords: string[]) => void;
  suggestions?: string[];
}
```

**Features**:
- Tag input with chips
- Add/remove keywords
- Autocomplete suggestions
- Validation (max 20 keywords, max 50 chars each)

#### 6. `PriceCalculator` Component
**File**: `frontend_v2/apps/web-vendor/src/components/products/PriceCalculator.tsx`

**Props**:
```typescript
interface PriceCalculatorProps {
  basePrice: number;
  baseQuantity: number;
  baseUnit: string;
  isDivisible: boolean;
  minOrderQuantity?: number;
  maxOrderQuantity?: number;
  variant?: Variant;
}
```

**Features**:
- Real-time price calculation
- Quantity input
- Shows unit price and total
- Validates min/max quantities
- Visual feedback for errors

#### 7. `ProductFilters` Component
**File**: `frontend_v2/apps/web-vendor/src/components/products/ProductFilters.tsx`

**Props**:
```typescript
interface ProductFiltersProps {
  filters: ProductFilters;
  onChange: (filters: ProductFilters) => void;
  categories: string[];
}
```

**Features**:
- Category dropdown
- Status toggle (active/inactive/all)
- Stock status filter
- Search input
- Clear filters button

#### 8. `ImageUpload` Component
**File**: `frontend_v2/apps/web-vendor/src/components/products/ImageUpload.tsx`

**Props**:
```typescript
interface ImageUploadProps {
  imageUrl?: string;
  onChange: (file: File | null) => void;
  maxSize?: number; // in MB
  aspectRatio?: number;
}
```

**Features**:
- Drag & drop upload
- Image preview
- Crop/resize functionality
- File validation
- Remove image option

---

## User Flows

### Flow 1: Create New Product

```
1. User clicks "Add Product" button
   ↓
2. Navigate to /catalog/new
   ↓
3. ProductForm loads with empty fields
   ↓
4. User fills Basic Information section
   - Enters product name
   - Adds description
   - Selects category
   - Uploads image
   ↓
5. User configures Pricing & Units
   - Selects base unit (e.g., "bottle")
   - Sets base quantity (e.g., 1)
   - Enters base price (e.g., ₹440)
   - Toggles divisibility
   - Sets min/max order quantities
   - Sees price calculator preview
   ↓
6. User adds Variants (optional)
   - Clicks "Add Variant"
   - Enters variant unit and price
   - Adds multiple variants
   ↓
7. User configures Inventory
   - Toggles stock tracking
   - Sets stock quantity
   - Sets in-stock status
   ↓
8. User adds AI Keywords
   - Adds keywords one by one
   - Sees suggestions
   ↓
9. User clicks "Save & Publish"
   ↓
10. Form validates all fields
    ↓
11. If valid: Submit to API → Show success → Redirect to product list
    If invalid: Show errors → User fixes → Repeat step 9
```

### Flow 2: Edit Existing Product

```
1. User clicks "Edit" on product card/row
   ↓
2. Navigate to /catalog/:id/edit
   ↓
3. ProductForm loads with existing product data
   ↓
4. User modifies fields
   ↓
5. User clicks "Save Changes"
   ↓
6. Form validates → Submit → Success → Redirect to product detail
```

### Flow 3: Bulk Operations

```
1. User selects multiple products (checkboxes)
   ↓
2. Bulk actions toolbar appears
   ↓
3. User selects action (Activate/Deactivate/Delete)
   ↓
4. Confirmation dialog appears
   ↓
5. User confirms
   ↓
6. API call for bulk operation
   ↓
7. Success message → Refresh list
```

### Flow 4: Search and Filter

```
1. User types in search bar
   ↓
2. Real-time filtering (debounced - 300ms delay)
   ↓
3. Results update with pagination reset to page 1
   ↓
4. User applies category filter
   ↓
5. Results filter by category (pagination reset)
   ↓
6. User applies status filter
   ↓
7. Results filter by status (pagination reset)
   ↓
8. User changes page → Load new page of filtered results
   ↓
9. User clears filters → All products shown (reset to page 1)
```

---

## Form Designs

### Product Form Schema

```typescript
interface ProductFormData {
  // Basic Information
  name: string;                    // Required, max 255 chars
  description?: string;            // Optional, max 5000 chars
  category?: string;               // Optional, max 100 chars
  imageUrl?: string;               // Optional, URL or File
  tags: string[];                 // Optional, array of strings
  
  // Pricing & Units
  baseUnit: string;                // Required, max 20 chars
  baseQuantity: number;            // Required, positive, max 1000000
  basePrice: number;                // Required, positive number (in RUPEES for form, converted to paise for API)
  isDivisible: boolean;             // Required, default false
  minOrderQuantity?: number;      // Optional, positive
  maxOrderQuantity?: number;       // Optional, positive
  
  // Variants
  variants?: Variant[];             // Optional array
  
  // Inventory
  stockQuantity?: number;           // Optional, non-negative (null = not tracking stock)
  inStock: boolean;                 // Required, default true
  // Note: If stockQuantity is null, stock tracking is disabled
  
  // AI Keywords
  keywords: string[];               // Optional, max 20 items, each max 50 chars
  
  // Status
  isActive: boolean;               // Required, default true
}
```

### Validation Rules

**Name**:
- Required
- Min length: 1
- Max length: 255
- No special characters: `<>`
- Trim whitespace

**Base Price**:
- Required
- Must be positive integer
- Max: 999999999 (₹9,999,999.99)
- Display in ₹ (rupees) but store in paise

**Base Quantity**:
- Required
- Must be positive number
- Max: 1,000,000
- Decimal precision: 3 decimal places

**Min/Max Order Quantity**:
- If both set: minOrderQuantity <= maxOrderQuantity
- Must be positive
- Decimal precision: 3 decimal places

**Keywords**:
- Max 20 keywords
- Each keyword: 1-50 characters
- No duplicates
- Case-insensitive matching
- Trim whitespace

**Variants**:
- Each variant must have unique unit
- **CRITICAL: Variant unit cannot be the same as baseUnit**
- Variant price must be positive
- Variant baseQuantity must be positive

**Stock Quantity**:
- Required if trackStock = true
- Must be non-negative
- Decimal precision: 3 decimal places

### Form Sections

#### Section 1: Basic Information
```typescript
<FormSection title="Basic Information" required>
  <TextField
    name="name"
    label="Product Name"
    required
    maxLength={255}
    placeholder="e.g., Rose Concentrate"
    helpText="Enter a clear, descriptive name for your product"
    error={touchedFields.has('name') && fieldErrors.name}
    onBlur={() => setTouchedFields(prev => new Set(prev).add('name'))}
    onChange={(e) => {
      setFormData({ ...formData, name: e.target.value });
      // Real-time validation
      if (e.target.value.trim().length === 0) {
        setFieldErrors({ ...fieldErrors, name: 'Product name is required' });
      } else if (e.target.value.length > 255) {
        setFieldErrors({ ...fieldErrors, name: 'Product name must be 255 characters or less' });
      } else {
        const newErrors = { ...fieldErrors };
        delete newErrors.name;
        setFieldErrors(newErrors);
      }
    }}
  />
  
  <TextArea
    name="description"
    label="Description"
    maxLength={5000}
    rows={4}
    placeholder="Describe your product..."
    helpText="Optional: Help customers understand your product"
  />
  
  <Select
    name="category"
    label="Category"
    options={categories}
    placeholder="Select category"
  />
  
  <ImageUpload
    name="imageUrl"
    label="Product Image"
    maxSize={5} // MB
    aspectRatio={1} // Square
  />
  
  <TagInput
    name="tags"
    label="Tags"
    placeholder="Add tags..."
    helpText="Add tags to help organize your products"
  />
</FormSection>
```

#### Section 2: Pricing & Units
```typescript
<FormSection title="Pricing & Units" required>
  <div className="grid grid-cols-3 gap-4">
    <Select
      name="baseUnit"
      label="Base Unit"
      required
      options={UNIT_OPTIONS}
      placeholder="Select unit"
      helpText="e.g., kg, piece, ml, bottle"
    />
    
    <NumberField
      name="baseQuantity"
      label="Base Quantity"
      required
      min={0.001}
      max={1000000}
      step={0.001}
      helpText="Quantity for base price"
    />
    
    <CurrencyField
      name="basePrice"
      label="Base Price (₹)"
      required
      min={0.01}
      step={0.01}
      helpText="Price for base quantity (in rupees)"
      // Note: This will be converted to paise when sending to API
    />
  </div>
  
  <Toggle
    name="isDivisible"
    label="Allow fractional quantities"
    helpText="Customers can order 0.5kg, 2.5 pieces, etc."
  />
  
  <div className="grid grid-cols-2 gap-4">
    <NumberField
      name="minOrderQuantity"
      label="Minimum Order Quantity"
      min={0.001}
      step={0.001}
      helpText="Minimum quantity customers must order"
    />
    
    <NumberField
      name="maxOrderQuantity"
      label="Maximum Order Quantity"
      min={0.001}
      step={0.001}
      helpText="Maximum quantity per order"
    />
  </div>
  
  <PriceCalculator
    basePrice={formData.basePrice}
    baseQuantity={formData.baseQuantity}
    baseUnit={formData.baseUnit}
    isDivisible={formData.isDivisible}
    minOrderQuantity={formData.minOrderQuantity}
    maxOrderQuantity={formData.maxOrderQuantity}
  />
</FormSection>
```

#### Section 3: Variants
```typescript
<FormSection title="Variants" optional>
  <VariantManager
    variants={formData.variants || []}
    onChange={(variants) => setFormData({ ...formData, variants })}
    baseUnit={formData.baseUnit}
  />
  
  <HelpText>
    Add different sizes or units for this product (e.g., 250ml, 900ml)
  </HelpText>
</FormSection>
```

#### Section 4: Inventory
```typescript
<FormSection title="Inventory Management">
  <Toggle
    name="trackStock"
    label="Track Stock Quantity"
    helpText="Enable to manage inventory levels"
    checked={formData.stockQuantity !== null && formData.stockQuantity !== undefined}
    onChange={(checked) => {
      setFormData({
        ...formData,
        stockQuantity: checked ? 0 : null
      });
    }}
  />
  
  {formData.stockQuantity !== null && (
    <>
      <NumberField
        name="stockQuantity"
        label="Stock Quantity"
        required
        min={0}
        step={0.001}
        helpText="Current available quantity"
      />
      
      <Toggle
        name="inStock"
        label="In Stock"
        helpText="Mark as out of stock to prevent orders"
      />
    </>
  )}
</FormSection>
```

#### Section 5: AI Keywords
```typescript
<FormSection title="AI Keywords">
  <KeywordsInput
    keywords={formData.keywords || []}
    onChange={(keywords) => setFormData({ ...formData, keywords })}
    suggestions={generateSuggestions(formData.name, formData.description)}
    maxKeywords={20}
    maxLength={50}
  />
  
  <HelpText>
    Add words customers might use when ordering. This helps AI match products correctly.
    Examples: "rose", "juice", "beverage", "drink"
  </HelpText>
</FormSection>
```

---

## Features & Functionality

### 1. Product List Features

**View Modes**:
- **Table View**: Sortable columns, compact display
- **Grid View**: Card-based layout, visual product display

**Sorting**:
- Name (A-Z, Z-A)
- Price (Low-High, High-Low)
- Created Date (Newest, Oldest)
- Stock Quantity (High-Low, Low-High)

**Filtering**:
- By Category
- By Status (Active, Inactive, All)
- By Stock Status (In Stock, Out of Stock, Low Stock)
- By Search Query (name, description, keywords)

**Pagination**:
- Page-based navigation (page numbers, prev/next buttons)
- Page size selector (10, 20, 50, 100 items per page)
- Total count display ("Showing 1-20 of 150 products")
- Pagination resets when filters change
- URL query parameters for deep linking

**Bulk Actions**:
- Activate selected products
- Deactivate selected products
- Delete selected products (soft delete)
- Export to CSV

**Quick Actions** (per product):
- Edit
- Duplicate
- Delete
- Toggle Active Status
- View Details

### 2. Product Form Features

**Real-time Validation**:
- **Field-level validation** on blur and change
- **Touched field tracking** - errors only shown for fields user has interacted with
- **Form-level validation** before submission
- **Inline error messages** below each field (red text)
- **Success indicators** for valid fields (green checkmark)
- **Error summary** at top of form if validation fails on submit
- **Prevent submission** if validation errors exist

**Price Calculator**:
- Live preview as user types
- Shows unit price and total for test quantity
- Validates min/max quantities
- Visual feedback for errors

**Variant Management**:
- Add/remove variants dynamically
- Validate unique units
- Duplicate variant detection
- Reorder variants (drag & drop)

**Keywords Management**:
- Add keywords with Enter key
- Remove keywords with × button
- Autocomplete suggestions
- Duplicate detection
- Character count indicator
- **Validation**: Max 20 keywords, each max 50 characters

**Search & Filter**:
- **Debounced search** (300ms delay) to reduce API calls
- Real-time filter updates
- Pagination resets when filters change
- URL query parameters for shareable filtered views

**Image Upload**:
- Drag & drop support
- Click to browse
- Image preview
- Crop/resize tool
- File size validation (max 5MB)
- Format validation (jpg, png, webp)

**Draft Saving**:
- Auto-save draft every 30 seconds
- Manual "Save Draft" button
- Restore draft on page reload
- Clear draft after publish

### 3. Product Detail Features

**Information Display**:
- Product image gallery
- All product details
- Pricing breakdown
- Variant list
- Inventory status
- Keywords display
- Usage statistics

**Actions**:
- Edit product
- Duplicate product
- Delete product (with confirmation)
- Toggle active status
- View orders containing this product

**Statistics**:
- Total orders
- Total revenue
- Average order quantity
- Last ordered date
- Stock turnover rate

### 4. Advanced Features

**Import/Export**:
- Export products to CSV
- Import products from CSV
- Template download
- Bulk import validation

**Product Templates**:
- Save product as template
- Create product from template
- Template library

**Product Analytics**:
- Sales trends
- Popular products
- Low stock alerts
- Price change history

---

## UI/UX Specifications

### Design System

**Colors**:
- Primary: `primary-600` (from existing theme)
- Success: Green (`#10B981`)
- Warning: Yellow (`#F59E0B`)
- Error: Red (`#EF4444`)
- Info: Blue (`#3B82F6`)

**Typography**:
- Headings: `font-bold`, `text-gray-900`
- Body: `text-gray-700`
- Labels: `text-sm`, `font-medium`, `text-gray-700`
- Help Text: `text-xs`, `text-gray-500`

**Spacing**:
- Section spacing: `space-y-6`
- Field spacing: `space-y-4`
- Form padding: `p-6`

**Components**:
- Use existing Card component
- Use existing Button component
- Use existing Input components
- Consistent with existing design system

### Interaction Patterns

**Loading States**:
- Skeleton loaders for product list
- Spinner for form submission
- Progress bar for bulk operations

**Error Handling**:
- Inline field errors (red text below field)
- Toast notifications for API errors
- Error boundary for unexpected errors

**Success Feedback**:
- Toast notification on save
- Success checkmark animation
- Confirmation dialogs for destructive actions

**Empty States**:
- Empty product list with "Add Product" CTA
- Empty search results with "Clear filters" option
- Empty variants section with "Add Variant" button

### Accessibility

**Keyboard Navigation**:
- Tab through form fields
- Enter to submit forms
- Escape to close modals
- Arrow keys for dropdowns

**Screen Readers**:
- Proper ARIA labels
- Form field labels
- Error announcements
- Status announcements

**Focus Management**:
- Focus on first field when form opens
- Focus on error field after validation
- Focus trap in modals

---

## Implementation Phases

### Phase 1: Core Product List (Week 1)
- [ ] Create ProductList component
- [ ] Implement table view
- [ ] Add search functionality
- [ ] Add basic filters
- [ ] Implement pagination
- [ ] Add loading states
- [ ] Add empty states

### Phase 2: Product Form - Basic (Week 2)
- [ ] Create ProductForm component
- [ ] Implement Basic Information section
- [ ] Implement Pricing & Units section
- [ ] Add form validation
- [ ] Connect to API
- [ ] Add error handling

### Phase 3: Product Form - Advanced (Week 3)
- [ ] Add VariantManager component
- [ ] Add KeywordsInput component
- [ ] Add PriceCalculator component
- [ ] Add ImageUpload component
- [ ] Implement Inventory section
- [ ] Add draft saving

### Phase 4: Product Detail & Actions (Week 4)
- [ ] Create ProductDetail page
- [ ] Add edit functionality
- [ ] Add delete functionality
- [ ] Add duplicate functionality
- [ ] Add bulk operations
- [ ] Add usage statistics

### Phase 5: Polish & Optimization (Week 5)
- [ ] Add grid view toggle
- [ ] Improve mobile responsiveness
- [ ] Add keyboard shortcuts
- [ ] Performance optimization
- [ ] Accessibility improvements
- [ ] User testing & feedback

---

## Accessibility & Responsiveness

### Mobile Responsiveness

**Breakpoints**:
- Mobile: < 640px
- Tablet: 640px - 1024px
- Desktop: > 1024px

**Mobile Adaptations**:
- Stack form fields vertically
- Full-width buttons
- Collapsible sections
- Bottom sheet for actions
- Swipe gestures for product cards

**Tablet Adaptations**:
- 2-column grid for forms
- Side-by-side layout where possible
- Touch-friendly targets (min 44x44px)

### Accessibility Features

**WCAG 2.1 AA Compliance**:
- Color contrast ratios meet standards
- Keyboard navigation support
- Screen reader compatibility
- Focus indicators visible
- Error messages accessible

**ARIA Labels**:
- Form fields have proper labels
- Buttons have descriptive labels
- Status messages announced
- Error messages associated with fields

**Keyboard Shortcuts**:
- `Ctrl/Cmd + K`: Focus search
- `Ctrl/Cmd + N`: New product
- `Esc`: Close modal/cancel
- `Enter`: Submit form
- `Tab`: Navigate fields

---

## File Structure

```
frontend_v2/apps/web-vendor/src/
├── pages/
│   ├── Products.tsx              # Main products list page
│   ├── ProductCreate.tsx         # Create product page
│   ├── ProductEdit.tsx           # Edit product page
│   └── ProductDetail.tsx         # Product detail page
│
├── components/
│   └── products/
│       ├── ProductList.tsx       # Product list component
│       ├── ProductCard.tsx       # Product card (grid view)
│       ├── ProductRow.tsx        # Product row (table view)
│       ├── ProductForm.tsx       # Main product form
│       ├── VariantManager.tsx    # Variant management
│       ├── KeywordsInput.tsx     # Keywords input
│       ├── PriceCalculator.tsx  # Price calculator
│       ├── ProductFilters.tsx    # Filter component
│       ├── ImageUpload.tsx       # Image upload
│       └── ProductActions.tsx    # Action buttons/menu
│
├── hooks/
│   └── products/
│       ├── useProducts.ts        # Products data hook (with pagination)
│       ├── useProductForm.ts    # Form state hook (with validation, touched fields)
│       ├── useProductFilters.ts # Filter state hook (with debouncing)
│       └── useDebounce.ts        # Debounce utility hook
│
├── lib/
│   └── products.ts               # API functions (already exists)
│
└── types/
    └── product.ts                # TypeScript types (already exists)
```

---

## API Integration

### Endpoints Used

```typescript
// List products with filtering and pagination
GET /api/products?category={cat}&isActive={true|false}&search={query}&inStock={true|false}&page={page}&pageSize={pageSize}
// Note: vendorId is automatically determined from authenticated user
// Query parameters:
//   - category: Filter by category
//   - isActive: Filter by active status (default: true)
//   - search: Search in name, description, keywords
//   - inStock: Filter by stock status
//   - page: Page number (default: 1)
//   - pageSize: Items per page (default: 20, max: 100)
// Response: { products: Product[], total: number, page: number, pageSize: number }

// Get single product
GET /api/products/:id

// Get product statistics
GET /api/products/:id/stats
// Returns: { totalOrders, totalRevenue, averageOrderQuantity, lastOrderedAt }

// Create product
POST /api/products
Body: ProductFormData
// Note: basePrice should be sent in RUPEES, backend converts to paise

// Update product
PUT /api/products/:id
Body: Partial<ProductFormData>
// Note: basePrice should be sent in RUPEES, backend converts to paise

// Delete product (soft delete)
DELETE /api/products/:id

// Bulk operations
POST /api/products/bulk
Body: { action: 'activate' | 'deactivate' | 'delete', ids: string[] }
// Returns: { success: boolean, updated: number, errors: Array<{id, error}> }

// Upload product image
POST /api/products/:id/image
Body: FormData with image file
// Note: Implementation depends on image storage solution
```

### Error Handling

```typescript
// Handle API errors
try {
  const product = await createProduct(data);
  toast.success('Product created successfully');
  navigate(`/catalog/${product.id}`);
} catch (error) {
  if (error.status === 400) {
    // Validation errors
    setFormErrors(error.details);
  } else if (error.status === 409) {
    // Duplicate product
    toast.error('Product name already exists');
  } else {
    // Server error
    toast.error('Failed to create product. Please try again.');
  }
}
```

### Price Conversion

**CRITICAL**: Backend stores prices in **paise** (₹1 = 100 paise), but frontend displays in **rupees**.

**File**: `frontend_v2/apps/web-vendor/src/utils/price.ts` (NEW)

```typescript
/**
 * Convert rupees to paise for API requests
 * CRITICAL: Proper rounding to avoid floating-point precision issues
 * @param rupees Price in rupees (e.g., 47.50)
 * @returns Price in paise (e.g., 4750)
 */
export function rupeesToPaise(rupees: number): number {
  // Round to avoid floating point issues (e.g., 47.50 * 100 = 4750.000000000001)
  return Math.round(Number((rupees * 100).toFixed(2)));
}

/**
 * Convert paise to rupees for display
 * CRITICAL: Ensure we don't lose precision
 * @param paise Price in paise (e.g., 4750)
 * @returns Price in rupees (e.g., 47.50)
 */
export function paiseToRupees(paise: number): number {
  // Ensure we don't lose precision
  return Number((paise / 100).toFixed(2));
}

/**
 * Format price for display
 * @param paise Price in paise
 * @returns Formatted string (e.g., "₹47.50")
 */
export function formatPrice(paise: number): string {
  const rupees = paiseToRupees(paise);
  return `₹${rupees.toFixed(2)}`;
}

/**
 * Format price without currency symbol
 * @param paise Price in paise
 * @returns Formatted string (e.g., "47.50")
 */
export function formatPriceNumber(paise: number): string {
  const rupees = paiseToRupees(paise);
  return rupees.toFixed(2);
}
```

**Usage in Product API Service**:

```typescript
// frontend_v2/apps/web-vendor/src/lib/products.ts
import { apiClient } from './api';
import { rupeesToPaise, paiseToRupees } from '../utils/price';
import type { Product } from '../types/product';

// Convert Product from API (paise) to display format
function convertProductFromAPI(product: any): Product {
  return {
    ...product,
    basePrice: paiseToRupees(product.basePrice), // Convert to rupees for display
    variants: product.variants?.map((v: any) => ({
      ...v,
      price: paiseToRupees(v.price) // Convert to rupees
    }))
  };
}

// Convert Product to API format (paise)
function convertProductToAPI(product: Partial<Product>): any {
  return {
    ...product,
    basePrice: product.basePrice ? rupeesToPaise(product.basePrice) : undefined,
    variants: product.variants?.map(v => ({
      ...v,
      price: rupeesToPaise(v.price)
    }))
  };
}

export async function getProducts(filters?: {
  category?: string;
  isActive?: boolean;
  search?: string;
  inStock?: boolean;
  page?: number;
  pageSize?: number;
}): Promise<{ products: Product[]; total: number; page: number; pageSize: number }> {
  const params = new URLSearchParams();
  if (filters?.category) params.append('category', filters.category);
  if (filters?.isActive !== undefined) params.append('isActive', String(filters.isActive));
  if (filters?.search) params.append('search', filters.search);
  if (filters?.inStock !== undefined) params.append('inStock', String(filters.inStock));
  if (filters?.page) params.append('page', String(filters.page));
  if (filters?.pageSize) params.append('pageSize', String(filters.pageSize));
  
  const response = await apiClient.get<{ products: any[]; total: number; page: number; pageSize: number }>(`/api/products?${params.toString()}`);
  return {
    products: response.products.map(convertProductFromAPI),
    total: response.total,
    page: response.page,
    pageSize: response.pageSize
  };
}

export async function createProduct(product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Promise<Product> {
  const apiData = convertProductToAPI(product);
  const created = await apiClient.post<any>('/api/products', apiData);
  return convertProductFromAPI(created);
}

export async function updateProduct(id: string, product: Partial<Product>): Promise<Product> {
  const apiData = convertProductToAPI(product);
  const updated = await apiClient.put<any>(`/api/products/${id}`, apiData);
  return convertProductFromAPI(updated);
}

export async function deleteProduct(id: string): Promise<void> {
  return apiClient.delete(`/api/products/${id}`);
}

export async function bulkUpdateProducts(
  action: 'activate' | 'deactivate' | 'delete',
  ids: string[]
): Promise<{ success: boolean; updated: number; errors: Array<{ id: string; error: string }> }> {
  return apiClient.post('/api/products/bulk', { action, ids });
}

export async function getProductStats(id: string): Promise<{
  totalOrders: number;
  totalRevenue: number; // In rupees
  averageOrderQuantity: number;
  lastOrderedAt: string | null;
}> {
  const stats = await apiClient.get(`/api/products/${id}/stats`);
  return {
    ...stats,
    totalRevenue: stats.totalRevenue // Already converted to rupees by backend
  };
}
```

---

## Testing Considerations

### Unit Tests
- Form validation logic
- Price calculation logic
- Variant management logic
- Keywords validation

### Integration Tests
- Product CRUD operations
- Filter and search functionality
- Bulk operations
- Image upload

### E2E Tests
- Create product flow
- Edit product flow
- Delete product flow
- Search and filter flow

---

## Success Metrics

### User Experience
- Time to create a product: < 2 minutes
- Form completion rate: > 90%
- Error rate: < 5%
- User satisfaction: > 4/5

### Performance
- Page load time: < 1 second
- Form submission: < 500ms
- Search response: < 200ms
- Image upload: < 3 seconds

### Business
- Products created per vendor: Track
- Products updated per vendor: Track
- Keywords per product: Average
- Variants per product: Average

---

## Conclusion

This UI plan provides a comprehensive roadmap for building a robust product management interface in the vendor portal. The phased approach ensures incremental delivery while maintaining quality and user experience.

**Key Highlights**:
- Intuitive form design with real-time validation
- Comprehensive product management features
- Mobile-responsive design
- Accessibility compliance
- Performance optimization
- Clear user flows and interactions

**Next Steps**:
1. Review and approve this plan
2. Create detailed component specifications
3. Set up development environment
4. Begin Phase 1 implementation
5. Regular user feedback sessions

---

## Critical Updates & Fixes Applied

### ✅ Fixed Critical Gaps

1. **API Contract Alignment**
   - ✅ Updated endpoints to match backend implementation
   - ✅ Fixed query parameters (`isActive` instead of `status`)
   - ✅ Added product statistics endpoint usage
   - ✅ Added bulk operations endpoint details

2. **Price Conversion Implementation**
   - ✅ Added complete price conversion utilities (`price.ts`)
   - ✅ Documented paise/rupees conversion
   - ✅ Updated Product API service with conversion functions
   - ✅ Fixed form data structure (prices in rupees)

3. **Form Data Structure**
   - ✅ Removed `trackStock` boolean (use `stockQuantity !== null` instead)
   - ✅ Updated inventory section to match backend schema
   - ✅ Fixed price field documentation (rupees in form, paise in API)

4. **API Service Updates**
   - ✅ Added `convertProductFromAPI()` function
   - ✅ Added `convertProductToAPI()` function
   - ✅ Updated all CRUD methods with price conversion
   - ✅ Added `bulkUpdateProducts()` function
   - ✅ Added `getProductStats()` function

### 📋 Frontend-Backend Contract

**Price Handling**:
- **Form Input**: Prices in **rupees** (e.g., `basePrice: 47.50`)
- **API Request**: Convert to paise using `rupeesToPaise()` (e.g., `basePrice: 4750`)
- **API Response**: Prices in **paise** (e.g., `basePrice: 4750`)
- **Display**: Convert to rupees using `paiseToRupees()` (e.g., `₹47.50`)

**Filter Parameters**:
- `category`: Filter by category
- `isActive`: Filter by active status (`true`/`false`, default: `true`)
- `search`: Search in name, description, keywords
- `inStock`: Filter by stock status (`true`/`false`)

**Stock Tracking**:
- If `stockQuantity` is `null` or `undefined`: Stock tracking disabled
- If `stockQuantity` is a number: Stock tracking enabled

---

**The plan is now aligned with backend implementation and ready for development!**

---

## Critical Improvements Applied

### ✅ Essential Fixes (Must Implement Before Production)

1. **Price Conversion Edge Cases**
   - ✅ Fixed: Added proper rounding with `toFixed(2)` to avoid floating-point precision issues
   - ✅ Impact: Prevents incorrect price calculations in frontend

2. **Variant Validation**
   - ✅ Fixed: Added validation that variant units cannot match baseUnit
   - ✅ Impact: Prevents pricing confusion and errors

### ✅ Important Improvements (Implement Soon After Launch)

3. **Form Validation Feedback**
   - ✅ Added: Touched field tracking - errors only shown for fields user has interacted with
   - ✅ Added: Real-time field-level validation with inline error messages
   - ✅ Added: Success indicators for valid fields
   - ✅ Impact: Better user experience and data quality

4. **Pagination Support**
   - ✅ Added: Page-based navigation with page size selector
   - ✅ Added: Total count display ("Showing X of Y products")
   - ✅ Added: Pagination resets when filters change
   - ✅ Impact: Better performance with large product catalogs

5. **Search Debouncing**
   - ✅ Added: 300ms debounce delay for search input
   - ✅ Impact: Reduces API calls and improves performance

6. **API Response Structure**
   - ✅ Updated: `getProducts()` now returns paginated response with total count
   - ✅ Impact: Proper pagination support in frontend

---

**All essential fixes are integrated and ready for implementation!**

