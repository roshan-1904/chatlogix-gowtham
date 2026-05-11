# Order Management Enhancements - Detailed Implementation Plan

## Overview

This plan implements essential order management features with a UI-first approach using hardcoded data. API and database updates will be implemented in later stages. The plan includes WhatsApp notifications, payment link management, and shipping facility preparation.

## Prerequisites

- Modal component implementation (see Stage 0)
- React Router v6 with useNavigate hook
- Existing UI components from @chatlogix/ui package
- API client structure from @chatlogix/api-client

---

## Stage 0: Modal Component Foundation

### 0.1 Create Modal Component in UI Package

**File**: `frontend_v2/packages/ui/src/Modal.tsx`

- Create reusable Modal component with:
  - Props: `isOpen: boolean`, `onClose: () => void`, `title?: string`, `children: ReactNode`, `size?: 'sm' | 'md' | 'lg' | 'xl'`
  - ESC key to close
  - Click outside to close (optional prop)
  - Focus trap for accessibility
  - ARIA labels and roles
  - Backdrop overlay
  - Animation transitions
- Export from `frontend_v2/packages/ui/src/index.tsx`

**Alternative**: If using third-party library, specify which one (e.g., Headless UI, Radix UI) and document usage pattern.

### 0.2 Create Modal Hook

**File**: `frontend_v2/apps/web-vendor/src/hooks/useModal.ts`

- Custom hook for modal state management:
  ```typescript
  export function useModal() {
    const [isOpen, setIsOpen] = useState(false);
    const open = useCallback(() => setIsOpen(true), []);
    const close = useCallback(() => setIsOpen(false), []);
    return { isOpen, open, close };
  }
  ```

---

## Stage 1: Order Quick Details Popup in Conversations Page

### 1.1 Create Order Quick Details Modal Component

**File**: `frontend_v2/apps/web-vendor/src/components/conversations/modals/OrderQuickDetailsModal.tsx`

- Modal component that displays minimal order information
- Props: 
  ```typescript
  interface OrderQuickDetailsModalProps {
    order: Order;
    isOpen: boolean;
    onClose: () => void;
    onViewFullDetails: (orderId: string) => void;
  }
  ```
- Display fields (hardcoded data structure):
  - Order number (prominent header)
  - Status badge with color coding
  - Total amount (formatted currency)
  - Items summary:
    - Item count
    - First 3 item names (truncated if more)
    - "View all X items" link if more than 3
  - Delivery address (truncated to 2 lines max)
  - Estimated delivery date (formatted)
  - Created date (formatted)
  - Payment status (if available)
- Action buttons:
  - "View Full Details" button (primary, navigates to order details page)
  - "Close" button (secondary)
- Layout: Card-based with proper spacing and typography
- Note: Use hardcoded order data matching the Order interface structure

**Hardcoded Data Example**:
```typescript
// HARDCODED DATA - Replace with API call
const mockOrder: Order = {
  id: 'order-123',
  orderNumber: 'ORD-2024-001',
  status: 'confirmed',
  items: [
    { product: 'Chocolate Brownie', quantity: 2, unitPrice: 150, totalPrice: 300 },
    { product: 'Vanilla Cake', quantity: 1, unitPrice: 500, totalPrice: 500 }
  ],
  totalAmount: 80000, // in paise
  deliveryAddress: '123 Main Street, City, State 12345',
  estimatedDelivery: '2024-01-15T18:00:00Z',
  createdAt: '2024-01-14T10:00:00Z'
};
```

### 1.2 Update CustomerDetailsPanel Component

**File**: `frontend_v2/apps/web-vendor/src/components/conversations/CustomerDetailsPanel.tsx`

- Import OrderQuickDetailsModal and useModal hook
- Add state for selected order: `const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)`
- Make order cards clickable with cursor-pointer styling
- Add onClick handler to both "Current/Pending Orders" and "Recent Orders" sections
- Render OrderQuickDetailsModal with selected order
- Handle navigation to full order details page via modal button

### 1.3 Add Route for Order Details Page

**File**: `frontend_v2/apps/web-vendor/src/App.tsx`

- Import OrderDetails page component
- Add route: `/orders/:orderId` for order details page
- Ensure route is within ProtectedRoute wrapper

### 1.4 Navigation Patterns

**File**: `frontend_v2/apps/web-vendor/src/utils/navigation.ts` (new utility file)

- Create navigation helper functions for order details and conversation navigation
- Support both state-based and query param navigation

---

## Stage 1.5: Order List Screen

### 1.5.1 Create Order List Page Component

**File**: `frontend_v2/apps/web-vendor/src/pages/Orders.tsx`

- Main order list page component
- Display all orders for the vendor with filtering and search capabilities
- Features:
  - **Header Section**:
    - Page title: "Orders"
    - Total orders count
    - Quick stats cards (Today's orders, Pending, Revenue)
  - **Filters and Search Section**:
    - Status filter dropdown (All, Pending, Confirmed, Preparing, Ready, Out for Delivery, Delivered, Cancelled)
    - Date range filter (Today, This Week, This Month, Custom Range)
    - Search input (by order number, customer phone)
    - Sort dropdown (Newest First, Oldest First, Amount High to Low, Amount Low to High)
    - Clear filters button
    - View toggle (Table/Card view) - preference stored in localStorage
  - **Order List Display**:
    - **Table View** (default on desktop):
      - Columns:
        1. **Order #**: Order number (clickable, links to order details)
        2. **Status**: Status badge with color coding
        3. **Customer**: Customer phone number (formatted, clickable tel: link)
        4. **Items**: Item count and summary (e.g., "3 items: Brownie, Cake...")
        5. **Amount**: Total amount (formatted currency, ₹ symbol)
        6. **Date**: Created date and time (formatted)
        7. **Actions**: Quick actions menu (three-dot menu)
      - Sortable columns (optional, future enhancement)
      - Responsive: On mobile, switch to card view automatically
    - **Card View** (default on mobile, optional on desktop):
      - Each order card shows:
        - Order number (clickable, links to order details)
        - Status badge with color coding
        - Customer phone number
        - Item count and summary
        - Total amount (formatted currency)
        - Created date and time
        - Estimated delivery date (if available)
        - Quick action buttons (View Details, Quick Actions menu)
    - Empty state when no orders match filters
    - Loading state with skeleton loaders
  - **Filter State Persistence**:
    - Store filter preferences in localStorage
    - Keys: `orderListFilters` (JSON object with status, dateRange, searchQuery, sortBy)
    - Restore filters on page load
    - Clear filters button resets localStorage
  - **Pagination** (if needed):
    - Page size selector (10, 25, 50, 100)
    - Previous/Next buttons
    - Page number indicators
- Use hardcoded order data initially
- Note: All data hardcoded, marked with comments

**Hardcoded Data Example**:
```typescript
// MOCK DATA - Will be replaced with real API call
const mockOrders: Order[] = [
  {
    id: 'order-123',
    orderNumber: 'ORD-2024-001',
    status: 'confirmed',
    items: JSON.stringify([
      { product: 'Chocolate Brownie', quantity: 2, unitPrice: 15000, totalPrice: 30000 }
    ]),
    totalAmount: 80000,
    customer: { phone: '+919876543210' },
    createdAt: '2024-01-14T10:00:00Z',
    estimatedDelivery: '2024-01-15T18:00:00Z'
  },
  // ... more mock orders
];

const mockStats = {
  totalOrders: 45,
  todayOrders: 5,
  pendingOrders: 12,
  totalRevenue: 1250000 // in paise
};
```

### 1.5.2 Create Order List Item Component

**File**: `frontend_v2/apps/web-vendor/src/components/orders/OrderListItem.tsx`

- Reusable order list item component
- Props:
  ```typescript
  interface OrderListItemProps {
    order: Order;
    onClick: (orderId: string) => void;
    onQuickAction?: (orderId: string, action: string) => void;
    viewMode?: 'table' | 'card'; // Display mode
  }
  ```
- Display order information in card/row format based on viewMode
- Clickable to navigate to order details
- Quick action menu (three-dot menu) with context-aware options based on order status:

**Per-Status Action List**:
```typescript
const getQuickActions = (status: string): QuickAction[] => {
  const baseActions = [
    { id: 'view', label: 'View Details', icon: '👁️' }
  ];
  
  switch (status) {
    case 'pending':
      return [
        ...baseActions,
        { id: 'confirm', label: 'Confirm Order', icon: '✅' },
        { id: 'cancel', label: 'Cancel Order', icon: '❌' }
      ];
    case 'confirmed':
      return [
        ...baseActions,
        { id: 'start_preparing', label: 'Start Preparing', icon: '👨‍🍳' },
        { id: 'send_payment_link', label: 'Send Payment Link', icon: '💳' },
        { id: 'cancel', label: 'Cancel Order', icon: '❌' }
      ];
    case 'preparing':
      return [
        ...baseActions,
        { id: 'mark_ready', label: 'Mark Ready', icon: '✅' },
        { id: 'cancel', label: 'Cancel Order', icon: '❌' }
      ];
    case 'ready':
      return [
        ...baseActions,
        { id: 'out_for_delivery', label: 'Out for Delivery', icon: '🚚' },
        { id: 'create_shipment', label: 'Create Shipment', icon: '📦' },
        { id: 'cancel', label: 'Cancel Order', icon: '❌' }
      ];
    case 'out_for_delivery':
      return [
        ...baseActions,
        { id: 'mark_delivered', label: 'Mark Delivered', icon: '🎉' },
        { id: 'track', label: 'Track Shipment', icon: '📍' }
      ];
    case 'delivered':
      return [
        ...baseActions,
        { id: 'view_invoice', label: 'View Invoice', icon: '📄' }
      ];
    case 'cancelled':
      return baseActions; // Only view details for cancelled orders
    default:
      return baseActions;
  }
};
```
- Actions that require confirmation (cancel, mark delivered) should trigger confirmation dialog
- Responsive design (table row on desktop, card on mobile)

### 1.5.3 Create Order Stats Cards Component

**File**: `frontend_v2/apps/web-vendor/src/components/orders/OrderStatsCards.tsx`

- Display order statistics in card format
- Stats to show:
  - Total Orders (with trend indicator)
  - Today's Orders
  - Pending Orders (with count)
  - Total Revenue (formatted currency)
- Props:
  ```typescript
  interface OrderStatsCardsProps {
    stats: {
      totalOrders: number;
      todayOrders: number;
      pendingOrders: number;
      totalRevenue: number;
    };
    isLoading?: boolean;
  }
  ```
- Use Card component from @chatlogix/ui
- Loading state with skeleton loaders

### 1.5.4 Create Order Filters Component

**File**: `frontend_v2/apps/web-vendor/src/components/orders/OrderFilters.tsx`

- Reusable filters component
- Props:
  ```typescript
  interface OrderFiltersProps {
    statusFilter: string;
    dateRange: { start?: Date; end?: Date };
    searchQuery: string;
    sortBy: string;
    onStatusFilterChange: (status: string) => void;
    onDateRangeChange: (range: { start?: Date; end?: Date }) => void;
    onSearchChange: (query: string) => void;
    onSortChange: (sort: string) => void;
    onClearFilters: () => void;
  }
  ```
- Filter controls:
  - Status dropdown
  - Date range picker (or preset buttons: Today, This Week, This Month)
  - Search input with debounce (300ms)
  - Sort dropdown
  - Clear all filters button
- Responsive layout (horizontal on desktop, stacked on mobile)
- Filter state persisted in localStorage

### 1.5.5 Add Order List Route

**File**: `frontend_v2/apps/web-vendor/src/App.tsx`

- Add route: `/orders` for order list page
- Ensure route is within ProtectedRoute wrapper
- Update sidebar navigation to include Orders link (if not already present)

### 1.5.6 Integrate Navigation from Order List to Order Details

**File**: `frontend_v2/apps/web-vendor/src/pages/Orders.tsx`

- Handle order item click to navigate to order details:
  ```typescript
  const handleOrderClick = (orderId: string) => {
    navigate(`/orders/${orderId}`);
  };
  ```
- Support back navigation from order details to order list
- Preserve filter state in localStorage (not URL query params)

---

## Stage 2: Order Details Page with Customer Conversation Popup

### 2.1 Create Order Details Page Component

**File**: `frontend_v2/apps/web-vendor/src/pages/OrderDetails.tsx`

- Main order details page component using React Router
- Get orderId from URL params: `const { orderId } = useParams<{ orderId: string }>()`
- Fetch order data (hardcoded for now, marked with comments)
- Display comprehensive order information in sections:
  - **Order Header Section**:
    - Order number (large, prominent)
    - Status badge
    - Total amount
    - Created date
    - Last updated timestamp
  - **Order Items Table**:
    - Product name
    - Quantity with unit
    - Unit price
    - Subtotal
    - Total row
    - Parse items from JSON format (handle both string and object)
  - **Customer Information Section**:
    - Customer phone (clickable tel: link)
    - Customer name (if available from insights)
    - "View Conversation" button (opens modal)
  - **Delivery Information Section**:
    - Delivery address
    - Delivery instructions
    - Estimated delivery date/time
    - Delivery status (if available)
  - **Payment Information Section**:
    - Payment status badge
    - Payment method
    - Payment amount
    - Payment date (if paid)
    - "Send Payment Link" button (see Stage 5)
  - **Shipping Information Section**:
    - Shipping partner (if assigned)
    - Tracking number (if available)
    - Shipping status
    - "Create Shipment" button (see Stage 6)
  - **Order Timeline Section**:
    - Visual timeline with status transitions
    - Timestamps for each status change
    - Estimated delivery indicator
  - **Action Buttons Section**:
    - Status update buttons (context-aware based on current status)
    - Cancel order button (with confirmation)
- Include breadcrumb navigation back to orders list
- Loading state: Skeleton loader or spinner
- Error state: Error message with retry button

**Hardcoded Data Structure**:
```typescript
// MOCK DATA - Will be replaced with real API call
const mockOrderData = {
  id: 'order-123',
  orderNumber: 'ORD-2024-001',
  status: 'confirmed',
  items: JSON.stringify([
    { product: 'Chocolate Brownie', quantity: 2, unit: 'piece', unitPrice: 15000, totalPrice: 30000 },
    { product: 'Vanilla Cake', quantity: 1, unit: 'piece', unitPrice: 50000, totalPrice: 50000 }
  ]),
  totalAmount: 80000,
  deliveryAddress: '123 Main Street, Apartment 4B, City, State 12345',
  deliveryInstructions: 'Ring doorbell twice',
  specialRequests: 'Add extra chocolate chips',
  estimatedDelivery: '2024-01-15T18:00:00Z',
  confirmedAt: '2024-01-14T11:00:00Z',
  customer: { phone: '+919876543210' },
  vendor: { businessName: 'Sweet Treats Bakery', phone: '+919123456789' },
  conversation: {
    id: 'conv-456',
    messages: [
      { content: 'I want to order a cake', senderType: 'customer', timestamp: '2024-01-14T10:00:00Z' },
      { content: 'Sure! What type of cake?', senderType: 'ai', timestamp: '2024-01-14T10:01:00Z' }
    ]
  }
};
```

### 2.2 Create Customer Conversation Quick View Modal

**File**: `frontend_v2/apps/web-vendor/src/components/orders/modals/CustomerConversationModal.tsx`

- Modal component for quick customer conversation view
- Props:
  ```typescript
  interface CustomerConversationModalProps {
    conversationId: string;
    customerId: string;
    customerPhone: string;
    isOpen: boolean;
    onClose: () => void;
    onOpenFullConversation: (conversationId: string) => void;
  }
  ```
- Display minimal conversation information:
  - **Header**: Customer phone number (formatted, clickable)
  - **Quick Stats**:
    - Total messages count
    - Last activity timestamp (relative time: "2 hours ago")
    - Conversation status badge
    - Order count (if available)
  - **Last Message Preview**:
    - Last 2-3 messages (truncated to 100 chars each)
    - Sender indicator (Customer/AI)
    - Timestamp
    - Scrollable container (max height: 300px)
  - **Conversation Metadata**:
    - Created date
    - Total conversation duration
    - Average response time (if available)
- Action buttons:
  - "Open Full Conversation" button (primary, navigates to conversations page)
  - "Close" button (secondary)
- Layout: Clean card design with proper spacing

**Hardcoded Data Example**:
```typescript
// HARDCODED DATA - Replace with API call
const mockConversationData = {
  id: 'conv-456',
  customerId: 'cust-789',
  customerPhone: '+919876543210',
  status: 'active',
  messageCount: 24,
  lastActivity: '2024-01-14T15:30:00Z',
  lastMessages: [
    { content: 'When will my order be delivered?', senderType: 'customer', timestamp: '2024-01-14T15:30:00Z' },
    { content: 'Your order will be delivered tomorrow by 6 PM.', senderType: 'ai', timestamp: '2024-01-14T15:31:00Z' }
  ],
  orderCount: 3,
  createdAt: '2024-01-10T09:00:00Z'
};
```

### 2.3 Integrate Conversation Modal in Order Details Page

**File**: `frontend_v2/apps/web-vendor/src/pages/OrderDetails.tsx`

- Import CustomerConversationModal and useModal hook
- Add state for conversation modal:
  ```typescript
  const conversationModal = useModal();
  const [conversationId, setConversationId] = useState<string | null>(null);
  ```
- Add "View Conversation" button in customer information section
- Open CustomerConversationModal when button clicked:
  ```typescript
  const handleViewConversation = () => {
    setConversationId(order.conversation?.id || null);
    conversationModal.open();
  };
  ```
- Handle navigation to conversations page from modal:
  ```typescript
  const handleOpenFullConversation = (convId: string) => {
    navigateToConversation(convId, navigate);
    conversationModal.close();
  };
  ```
- Ensure conversation is pre-selected when navigating (see navigation patterns)

### 2.4 Update Conversations Page for Pre-selection

**File**: `frontend_v2/apps/web-vendor/src/pages/Conversations.tsx`

- Check for conversationId in navigation state or query params:
  ```typescript
  const location = useLocation();
  const conversationIdFromState = location.state?.conversationId;
  const searchParams = new URLSearchParams(location.search);
  const conversationIdFromQuery = searchParams.get('conversationId');
  const conversationId = conversationIdFromState || conversationIdFromQuery;
  ```
- Auto-select conversation if conversationId is present:
  ```typescript
  useEffect(() => {
    if (conversationId && conversations.length > 0) {
      const conversation = conversations.find(c => c.id === conversationId);
      if (conversation) {
        handleConversationSelect(conversation);
      }
    }
  }, [conversationId, conversations]);
  ```

---

## Stage 3: Product Mapping Preparation

### 3.1 Update Order Types to Include Product References

**File**: `frontend_v2/apps/web-vendor/src/components/conversations/types.ts`

- Extend Order interface to include optional product mapping fields:
  ```typescript
  export interface Order {
    // ... existing fields
    productIds?: string[]; // Array of product IDs (for future mapping)
    productMapping?: { [productName: string]: string }; // Product name to ID mapping
    items?: OrderItem[]; // Enhanced items with product references
  }
  
  export interface OrderItem {
    product: string; // Product name
    productId?: string; // Product ID (for future mapping)
    quantity: number;
    unit?: string;
    unitPrice: number;
    totalPrice: number;
  }
  ```

### 3.2 Add Product Mapping Placeholder in Order Details

**File**: `frontend_v2/apps/web-vendor/src/pages/OrderDetails.tsx`

- In Order Items Table, make product names clickable (disabled state):
  ```tsx
  <td>
    <button 
      disabled 
      className="text-blue-600 hover:text-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
      title="Product management coming soon"
    >
      {item.product}
    </button>
  </td>
  ```
- Add tooltip: "Product management coming soon"
- Add comment: `// TODO: Link to products management page when implemented`
- Add visual indicator (icon or badge) showing "Coming Soon"
- Note: Keep product mapping structure ready but non-functional initially

---

## Stage 4: WhatsApp Notification System (UI Structure)

### 4.1 Create WhatsApp Notification Service Interface

**File**: `frontend_v2/apps/web-vendor/src/services/whatsappNotifications.ts`

- Service interface for sending WhatsApp template messages
- Functions:
  ```typescript
  export interface WhatsAppNotificationService {
    sendOrderStatusUpdate(
      orderId: string, 
      status: string, 
      orderData: Order
    ): Promise<{ success: boolean; messageId?: string; error?: string }>;
    
    sendOrderTemplateMessage(
      customerPhone: string, 
      templateName: string, 
      parameters: Record<string, string>
    ): Promise<{ success: boolean; messageId?: string; error?: string }>;
  }
  
  // Mock implementation
  export const whatsappNotifications: WhatsAppNotificationService = {
    async sendOrderStatusUpdate(orderId, status, orderData) {
      // MOCK IMPLEMENTATION - Replace with actual API call
      console.log('Mock: Sending WhatsApp notification', { orderId, status });
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
      return { success: true, messageId: `msg-${Date.now()}` };
    },
    // ... other methods
  };
  ```
- Note: Implementation will be mocked/hardcoded initially, actual API calls later

### 4.2 Create Template Message Configuration

**File**: `frontend_v2/apps/web-vendor/src/config/whatsappTemplates.ts`

- Define template message structures for each order status:
  ```typescript
  export interface WhatsAppTemplate {
    name: string;
    language: string;
    components: Array<{
      type: 'body' | 'header' | 'button';
      parameters: Array<{ type: string; text: string }>;
    }>;
  }
  
  export const orderStatusTemplates: Record<string, WhatsAppTemplate> = {
    order_confirmed: {
      name: 'order_confirmed',
      language: 'en',
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: '{{orderNumber}}' },
            { type: 'text', text: '{{totalAmount}}' },
            { type: 'text', text: '{{estimatedDelivery}}' }
          ]
        }
      ]
    },
    order_preparing: {
      name: 'order_preparing',
      language: 'en',
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: '{{orderNumber}}' }
          ]
        }
      ]
    },
    order_ready: {
      name: 'order_ready',
      language: 'en',
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: '{{orderNumber}}' },
            { type: 'text', text: '{{pickupInfo}}' }
          ]
        }
      ]
    },
    order_out_for_delivery: {
      name: 'order_out_for_delivery',
      language: 'en',
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: '{{orderNumber}}' },
            { type: 'text', text: '{{trackingNumber}}' }
          ]
        }
      ]
    },
    order_delivered: {
      name: 'order_delivered',
      language: 'en',
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: '{{orderNumber}}' },
            { type: 'text', text: '{{thankYouMessage}}' }
          ]
        }
      ]
    },
    order_cancelled: {
      name: 'order_cancelled',
      language: 'en',
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: '{{orderNumber}}' },
            { type: 'text', text: '{{cancellationReason}}' }
          ]
        }
      ]
    }
  };
  
  export function getTemplateParameters(
    status: string, 
    order: Order
  ): Record<string, string> {
    // Map order data to template parameters
    // HARDCODED MAPPING - Replace with actual data transformation
    return {
      orderNumber: order.orderNumber,
      totalAmount: `₹${(order.totalAmount / 100).toFixed(2)}`,
      estimatedDelivery: order.estimatedDelivery 
        ? new Date(order.estimatedDelivery).toLocaleDateString()
        : 'TBD',
      // ... other parameters
    };
  }
  ```
- Note: These are placeholder structures matching WhatsApp template format

### 4.3 Add Notification Settings UI in Order Details

**File**: `frontend_v2/apps/web-vendor/src/pages/OrderDetails.tsx`

- Add notification settings section (collapsible or always visible):
  - Toggle/checkbox: "Send WhatsApp notification on status change"
  - Default: enabled (stored in localStorage for now)
  - Visual indicator when notification is sent (toast or inline message)
  - Settings location: Above action buttons section or in a settings panel
- Store preference in localStorage:
  ```typescript
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    const saved = localStorage.getItem('orderNotificationsEnabled');
    return saved !== null ? JSON.parse(saved) : true;
  });
  
  useEffect(() => {
    localStorage.setItem('orderNotificationsEnabled', JSON.stringify(notificationsEnabled));
  }, [notificationsEnabled]);
  ```
- Note: Actual sending will be mocked initially

### 4.4 Integrate Notification Trigger in Status Updates

**File**: `frontend_v2/apps/web-vendor/src/pages/OrderDetails.tsx`

- When order status is updated via action buttons:
  ```typescript
  const handleStatusUpdate = async (newStatus: string, additionalData?: any) => {
    try {
      // Update status (mocked)
      await updateOrderStatus(orderId, newStatus, additionalData);
      
      // Send notification if enabled
      if (notificationsEnabled) {
        const result = await whatsappNotifications.sendOrderStatusUpdate(
          orderId,
          newStatus,
          orderData
        );
        
        if (result.success) {
          showSuccessMessage('Status updated and notification sent');
        } else {
          showErrorMessage('Status updated but notification failed');
        }
      } else {
        showSuccessMessage('Status updated');
      }
      
      // Refresh order data
      await loadOrderDetails();
    } catch (error) {
      showErrorMessage('Failed to update order status');
    }
  };
  ```
- Show loading state during update
- Show success/error message (toast or inline)
- Note: Use hardcoded template message structure

---

## Stage 5: Payment Link Management (UI Structure)

### 5.1 Create Payment Link Service Interface

**File**: `frontend_v2/apps/web-vendor/src/services/paymentLinks.ts`

- Service interface for payment link management:
  ```typescript
  export interface PaymentLinkService {
    generatePaymentLink(
      orderId: string, 
      amount: number, 
      customerPhone: string
    ): Promise<{ success: boolean; paymentLink?: string; error?: string }>;
    
    sendPaymentLink(
      orderId: string, 
      paymentLink: string, 
      customerPhone: string
    ): Promise<{ success: boolean; messageId?: string; error?: string }>;
    
    getPaymentLinkStatus(
      paymentLinkId: string
    ): Promise<{ status: 'pending' | 'paid' | 'expired' | 'failed'; paidAt?: string }>;
  }
  
  // Mock implementation
  export const paymentLinkService: PaymentLinkService = {
    async generatePaymentLink(orderId, amount, customerPhone) {
      // MOCK IMPLEMENTATION - Replace with actual API call
      console.log('Mock: Generating payment link', { orderId, amount });
      await new Promise(resolve => setTimeout(resolve, 1500));
      const mockLink = `https://pay.chatlogix.com/pay/${orderId}-${Date.now()}`;
      return { success: true, paymentLink: mockLink };
    },
    // ... other methods
  };
  ```
- Note: Implementation will be mocked initially

### 5.2 Add Payment Link UI in Order Details

**File**: `frontend_v2/apps/web-vendor/src/pages/OrderDetails.tsx`

- In Payment Information Section, add:
  - **Payment Status Display**:
    - Status badge (Pending, Paid, Failed, Expired)
    - Payment amount
    - Payment method (if paid)
    - Payment date (if paid)
  - **Payment Link Actions**:
    - "Generate Payment Link" button (if no link exists)
    - "Send Payment Link via WhatsApp" button (if link exists and not paid)
    - "Copy Payment Link" button (if link exists)
    - Payment link URL display (if exists, truncated with copy option)
  - **Payment Link Status**:
    - Link expiration time (if applicable)
    - Last sent timestamp
    - Payment status indicator

### 5.3 Create Payment Link Modal

**File**: `frontend_v2/apps/web-vendor/src/components/orders/modals/PaymentLinkModal.tsx`

- Modal for payment link management:
  - Display generated payment link (full URL, copyable)
  - QR code display (placeholder for now)
  - "Send via WhatsApp" button
  - "Copy Link" button
  - Payment status indicator
  - Close button
- Props:
  ```typescript
  interface PaymentLinkModalProps {
    orderId: string;
    orderAmount: number;
    customerPhone: string;
    paymentLink?: string;
    isOpen: boolean;
    onClose: () => void;
    onLinkGenerated: (link: string) => void;
  }
  ```

### 5.4 Integrate Payment Link in Order Details

**File**: `frontend_v2/apps/web-vendor/src/pages/OrderDetails.tsx`

- Add state for payment link:
  ```typescript
  const [paymentLink, setPaymentLink] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'paid' | 'expired' | 'failed'>('pending');
  const paymentLinkModal = useModal();
  ```
- Handle payment link generation:
  ```typescript
  const handleGeneratePaymentLink = async () => {
    try {
      const result = await paymentLinkService.generatePaymentLink(
        orderId,
        order.totalAmount,
        order.customer.phone
      );
      if (result.success && result.paymentLink) {
        setPaymentLink(result.paymentLink);
        paymentLinkModal.open();
      }
    } catch (error) {
      showErrorMessage('Failed to generate payment link');
    }
  };
  ```
- Handle sending payment link via WhatsApp:
  ```typescript
  const handleSendPaymentLink = async () => {
    if (!paymentLink) return;
    try {
      const result = await whatsappNotifications.sendOrderTemplateMessage(
        order.customer.phone,
        'payment_link',
        { paymentLink, orderNumber: order.orderNumber }
      );
      if (result.success) {
        showSuccessMessage('Payment link sent via WhatsApp');
      }
    } catch (error) {
      showErrorMessage('Failed to send payment link');
    }
  };
  ```

---

## Stage 6: Shipping Facility Preparation (UI Structure)

### 6.1 Create Shipping Service Interface

**File**: `frontend_v2/apps/web-vendor/src/services/shipping.ts`

- Service interface for shipping management:
  ```typescript
  export interface ShippingService {
    createShipment(
      orderId: string, 
      shippingData: ShippingData
    ): Promise<{ success: boolean; shipmentId?: string; trackingNumber?: string; error?: string }>;
    
    getShippingRates(
      orderId: string, 
      deliveryAddress: string
    ): Promise<{ success: boolean; rates?: ShippingRate[]; error?: string }>;
    
    generateShippingLabel(
      shipmentId: string
    ): Promise<{ success: boolean; labelUrl?: string; error?: string }>;
    
    trackShipment(
      trackingNumber: string
    ): Promise<{ success: boolean; status?: string; updates?: ShippingUpdate[]; error?: string }>;
  }
  
  export interface ShippingData {
    deliveryAddress: string;
    customerPhone: string;
    customerName?: string;
    weight?: number;
    dimensions?: { length: number; width: number; height: number };
    shippingPartner?: 'shiprocket' | 'delhivery' | 'self';
  }
  
  export interface ShippingRate {
    partner: string;
    service: string;
    cost: number;
    estimatedDays: number;
  }
  
  export interface ShippingUpdate {
    status: string;
    location?: string;
    timestamp: string;
    description: string;
  }
  
  // Mock implementation
  export const shippingService: ShippingService = {
    async createShipment(orderId, shippingData) {
      // MOCK IMPLEMENTATION - Replace with actual API call
      console.log('Mock: Creating shipment', { orderId, shippingData });
      await new Promise(resolve => setTimeout(resolve, 2000));
      const mockTrackingNumber = `TRACK${Date.now()}`;
      return { 
        success: true, 
        shipmentId: `ship-${Date.now()}`,
        trackingNumber: mockTrackingNumber
      };
    },
    // ... other methods
  };
  ```
- Note: Implementation will be mocked initially

### 6.2 Add Shipping UI in Order Details

**File**: `frontend_v2/apps/web-vendor/src/pages/OrderDetails.tsx`

- In Shipping Information Section, add:
  - **Shipping Status Display**:
    - Shipping status badge (Not Created, Created, In Transit, Delivered, Failed)
    - Shipping partner name (if assigned)
    - Tracking number (if available, clickable)
    - Estimated delivery date
  - **Shipping Actions**:
    - "Create Shipment" button (if not created)
    - "View Shipping Rates" button (before creating)
    - "Generate Shipping Label" button (if shipment created)
    - "Track Shipment" button (if tracking number exists)
  - **Shipping Details**:
    - Shipping cost (if available)
    - Shipping method
    - Package weight/dimensions (if available)
    - Shipping timeline/updates

### 6.3 Create Shipping Modal

**File**: `frontend_v2/apps/web-vendor/src/components/orders/modals/ShippingModal.tsx`

- Modal for shipping management:
  - **Shipping Partner Selection** (if not created):
    - Radio buttons or dropdown for shipping partners
    - Display shipping rates for each partner
    - Estimated delivery times
  - **Shipment Creation Form** (if rates selected):
    - Pre-filled delivery address
    - Package weight input
    - Package dimensions inputs
    - Shipping service selection
    - "Create Shipment" button
  - **Shipment Details** (if created):
    - Tracking number display
    - Shipping label preview/download
    - Tracking status
    - Shipping timeline
- Props:
  ```typescript
  interface ShippingModalProps {
    orderId: string;
    order: Order;
    isOpen: boolean;
    onClose: () => void;
    onShipmentCreated: (shipmentId: string, trackingNumber: string) => void;
  }
  ```

### 6.4 Integrate Shipping in Order Details

**File**: `frontend_v2/apps/web-vendor/src/pages/OrderDetails.tsx`

- Add state for shipping:
  ```typescript
  const [shippingStatus, setShippingStatus] = useState<'not_created' | 'created' | 'in_transit' | 'delivered'>('not_created');
  const [trackingNumber, setTrackingNumber] = useState<string | null>(null);
  const [shippingPartner, setShippingPartner] = useState<string | null>(null);
  const shippingModal = useModal();
  ```
- Handle shipment creation:
  ```typescript
  const handleCreateShipment = async (shippingData: ShippingData) => {
    try {
      const result = await shippingService.createShipment(orderId, shippingData);
      if (result.success && result.trackingNumber) {
        setTrackingNumber(result.trackingNumber);
        setShippingStatus('created');
        setShippingPartner(shippingData.shippingPartner || 'self');
        showSuccessMessage('Shipment created successfully');
        shippingModal.close();
      }
    } catch (error) {
      showErrorMessage('Failed to create shipment');
    }
  };
  ```
- Handle shipping label generation:
  ```typescript
  const handleGenerateLabel = async () => {
    if (!trackingNumber) return;
    try {
      const result = await shippingService.generateShippingLabel(trackingNumber);
      if (result.success && result.labelUrl) {
        window.open(result.labelUrl, '_blank');
      }
    } catch (error) {
      showErrorMessage('Failed to generate shipping label');
    }
  };
  ```

---

## Stage 7: Backend API Structure (Placeholder)

### 7.1 Create WhatsApp Template Message Service

**File**: `backend/src/services/whatsappTemplateService.ts` (placeholder)

- Service class for sending WhatsApp template messages:
  ```typescript
  export class WhatsAppTemplateService {
    async sendOrderStatusUpdate(
      orderId: string, 
      newStatus: string
    ): Promise<void> {
      // TODO: Implement WhatsApp template message sending
      // 1. Fetch order details
      // 2. Get customer phone number
      // 3. Get appropriate template for status
      // 4. Map order data to template parameters
      // 5. Send via WhatsApp API
      // 6. Log notification sent
    }
    
    async sendTemplateMessage(
      phoneNumber: string, 
      templateName: string, 
      parameters: Record<string, string>
    ): Promise<void> {
      // TODO: Implement generic template message sending
    }
    
    async sendPaymentLink(
      customerPhone: string, 
      paymentLink: string, 
      orderNumber: string
    ): Promise<void> {
      // TODO: Implement payment link WhatsApp notification
    }
  }
  ```
- Note: This file will be created but implementation deferred to later stage

### 7.2 Create Payment Link Service

**File**: `backend/src/services/paymentLinkService.ts` (placeholder)

- Service class for payment link management:
  ```typescript
  export class PaymentLinkService {
    async generatePaymentLink(
      orderId: string, 
      amount: number, 
      customerPhone: string
    ): Promise<string> {
      // TODO: Implement payment link generation
      // 1. Create payment link via payment gateway (Razorpay/Stripe)
      // 2. Store link in database
      // 3. Set expiration time
      // 4. Return payment link URL
    }
    
    async getPaymentLinkStatus(
      paymentLinkId: string
    ): Promise<PaymentLinkStatus> {
      // TODO: Implement payment link status check
    }
    
    async handlePaymentWebhook(
      webhookData: any
    ): Promise<void> {
      // TODO: Implement payment webhook handling
      // 1. Verify webhook signature
      // 2. Update order payment status
      // 3. Send confirmation notification
    }
  }
  ```
- Note: Implementation deferred to later stage

### 7.3 Create Shipping Service

**File**: `backend/src/services/shippingService.ts` (placeholder)

- Service class for shipping management:
  ```typescript
  export class ShippingService {
    async createShipment(
      orderId: string, 
      shippingData: ShippingData
    ): Promise<Shipment> {
      // TODO: Implement shipment creation
      // 1. Validate shipping data
      // 2. Call shipping partner API (Shiprocket/Delhivery)
      // 3. Store shipment details in database
      // 4. Generate tracking number
      // 5. Return shipment information
    }
    
    async getShippingRates(
      orderId: string, 
      deliveryAddress: string
    ): Promise<ShippingRate[]> {
      // TODO: Implement shipping rate calculation
      // 1. Get order weight/dimensions
      // 2. Call shipping partner APIs for rates
      // 3. Return available rates
    }
    
    async generateShippingLabel(
      shipmentId: string
    ): Promise<string> {
      // TODO: Implement shipping label generation
      // 1. Fetch shipment details
      // 2. Call shipping partner API for label
      // 3. Store label URL
      // 4. Return label URL
    }
    
    async trackShipment(
      trackingNumber: string
    ): Promise<ShippingUpdate[]> {
      // TODO: Implement shipment tracking
      // 1. Call shipping partner API for tracking
      // 2. Parse tracking updates
      // 3. Return tracking information
    }
  }
  ```
- Note: Implementation deferred to later stage

### 7.4 Update Order Status Update Endpoint

**File**: `backend/src/routes/orders.ts`

- Modify `PUT /api/orders/:id/status` endpoint:
  ```typescript
  // Add comment: TODO: Integrate WhatsApp notification service
  // After status update:
  // 1. Update order status in database
  // 2. If notification enabled, trigger WhatsApp notification
  // 3. Return updated order
  ```
- Add placeholder for notification trigger after status update
- Note: Actual integration will be done in later stage

### 7.5 Create Payment Link Endpoints (Placeholder)

**File**: `backend/src/routes/payments.ts` (new file, placeholder)

- Create endpoints:
  ```typescript
  // POST /api/orders/:orderId/payment-link
  // Generate payment link for order
  
  // GET /api/payment-links/:linkId/status
  // Get payment link status
  
  // POST /api/payments/webhook
  // Handle payment webhooks
  ```
- Note: Implementation deferred to later stage

### 7.6 Create Shipping Endpoints (Placeholder)

**File**: `backend/src/routes/shipping.ts` (new file, placeholder)

- Create endpoints:
  ```typescript
  // POST /api/orders/:orderId/shipment
  // Create shipment for order
  
  // GET /api/orders/:orderId/shipping-rates
  // Get shipping rates for order
  
  // GET /api/shipments/:shipmentId/label
  // Generate shipping label
  
  // GET /api/shipments/:trackingNumber/track
  // Track shipment
  ```
- Note: Implementation deferred to later stage

---

## Stage 8: Frontend API Integration

### Overview

This stage replaces all mock/hardcoded data in the order management screens with real API calls. The UI components are already implemented (Stages 0-2), and backend endpoints are available (Stage 7). This stage focuses on creating the service layer and integrating API calls into existing components.

### Prerequisites

- Order Details page UI completed (Stage 2)
- Backend order endpoints available (`GET /api/orders/:id`, `PUT /api/orders/:id/status`)
- API client configured (`@chatlogix/api-client`)
- Order type definitions in place (`frontend_v2/apps/web-vendor/src/components/conversations/types.ts`)

### Current Backend Endpoint Status

**Available Endpoints:**
- `GET /api/orders/:id` - Get order details ✅
- `PUT /api/orders/:id/status` - Update order status ✅
- `POST /api/orders/:id/confirm` - Confirm order ✅
- `POST /api/orders/:id/cancel` - Cancel order ✅
- `GET /api/orders/vendor/:vendorId/stats` - Get order statistics ✅

**Placeholder Endpoints (501 Not Implemented):**
- `POST /api/orders/:orderId/payment-link` - Generate payment link ⏳
- `GET /api/payment-links/:linkId/status` - Get payment status ⏳
- `POST /api/orders/:orderId/shipment` - Create shipment ⏳
- `GET /api/orders/:orderId/shipping-rates` - Get shipping rates ⏳
- `POST /api/orders/:id/notify` - Send notification (if separate endpoint) ⏳

---

### 8.1 Create Order Service

**File**: `frontend_v2/apps/web-vendor/src/services/orderService.ts`

- Create service interface and implementation for order-related API calls
- Centralize all order API logic
- Handle request/response transformation
- Provide type-safe methods

**Implementation**:
```typescript
import { apiClient } from '../lib/api';
import type { Order } from '../components/conversations/types';

export interface OrderStatusUpdate {
  status: string;
  estimatedDelivery?: string;
  cancellationReason?: string;
}

export interface OrderService {
  getOrderDetails(orderId: string): Promise<Order>;
  updateOrderStatus(orderId: string, update: OrderStatusUpdate): Promise<Order>;
  confirmOrder(orderId: string, estimatedDelivery?: string): Promise<Order>;
  cancelOrder(orderId: string, reason?: string): Promise<Order>;
}

export const orderService: OrderService = {
  /**
   * Fetch order details by ID
   * @param orderId - Order ID
   * @returns Order object with all details
   * @throws Error if order not found or access denied
   */
  async getOrderDetails(orderId: string): Promise<Order> {
    try {
      const order = await apiClient.get<Order>(`/orders/${orderId}`);
      return order;
    } catch (error: any) {
      // Transform API errors to user-friendly messages
      if (error?.message?.includes('404') || error?.message?.includes('not found')) {
        throw new Error('Order not found');
      }
      if (error?.message?.includes('403') || error?.message?.includes('unauthorized')) {
        throw new Error('You do not have permission to view this order');
      }
      throw error;
    }
  },

  /**
   * Update order status
   * @param orderId - Order ID
   * @param update - Status update data
   * @returns Updated order object
   */
  async updateOrderStatus(orderId: string, update: OrderStatusUpdate): Promise<Order> {
    try {
      const order = await apiClient.put<Order>(`/orders/${orderId}/status`, update);
      return order;
    } catch (error: any) {
      if (error?.message?.includes('400') || error?.message?.includes('Invalid status')) {
        throw new Error('Invalid status transition');
      }
      throw error;
    }
  },

  /**
   * Confirm an order
   * @param orderId - Order ID
   * @param estimatedDelivery - Optional estimated delivery date (ISO string)
   * @returns Updated order object
   */
  async confirmOrder(orderId: string, estimatedDelivery?: string): Promise<Order> {
    try {
      const order = await apiClient.post<Order>(`/orders/${orderId}/confirm`, {
        estimatedDelivery,
      });
      return order;
    } catch (error: any) {
      throw error;
    }
  },

  /**
   * Cancel an order
   * @param orderId - Order ID
   * @param reason - Optional cancellation reason
   * @returns Updated order object
   */
  async cancelOrder(orderId: string, reason?: string): Promise<Order> {
    try {
      const order = await apiClient.post<Order>(`/orders/${orderId}/cancel`, { reason });
      return order;
    } catch (error: any) {
      throw error;
    }
  },
};
```

**Notes**:
- Service methods handle error transformation for better UX
- All methods are async and return Promises
- Type safety ensured through TypeScript interfaces
- Error messages are user-friendly

---

### 8.2 Replace Mock Data in OrderDetails Page

**File**: `frontend_v2/apps/web-vendor/src/pages/OrderDetails.tsx`

- Remove all mock data (lines 16-41)
- Replace `loadOrderDetails` function with API call
- Replace `handleStatusUpdate` function with API call
- Add proper error handling and loading states
- Ensure data transformation handles backend response format

**Step 1: Remove Mock Data**

Remove the mock order data constant:
```typescript
// DELETE THIS SECTION (lines 16-41):
// MOCK DATA - Will be replaced with real API call
const mockOrderData: Order = { ... };
```

**Step 2: Import Order Service**

Add import at the top:
```typescript
import { orderService } from '../services/orderService';
```

**Step 3: Update loadOrderDetails Function**

Replace the mock implementation (lines 67-87) with:
```typescript
useEffect(() => {
  const loadOrderDetails = async () => {
    if (!orderId) {
      setError('Order ID is required');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      const orderData = await orderService.getOrderDetails(orderId);
      
      // Ensure items are properly parsed (handle both string and array)
      // The parseOrderItems utility will handle this
      setOrder(orderData);
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to load order details';
      setError(errorMessage);
      console.error('Error loading order:', err);
      
      // If order not found, show specific message
      if (errorMessage.includes('not found')) {
        setError('Order not found. It may have been deleted or you do not have access.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  loadOrderDetails();
}, [orderId]);
```

**Step 4: Update handleStatusUpdate Function**

Replace the mock implementation (lines 89-105) with:
```typescript
const handleStatusUpdate = async (newStatus: string) => {
  if (!order) {
    setError('No order data available');
    return;
  }

  // Validate status transition
  if (!isValidStatusTransition(order.status, newStatus)) {
    setError(`Invalid status transition from ${order.status} to ${newStatus}`);
    return;
  }

  // Show confirmation for critical actions
  if (newStatus === 'cancelled') {
    const confirmed = window.confirm(
      'Are you sure you want to cancel this order? This action cannot be undone.'
    );
    if (!confirmed) return;
  }

  if (newStatus === 'delivered') {
    const confirmed = window.confirm('Mark this order as delivered?');
    if (!confirmed) return;
  }

  setIsLoading(true);
  setError(null);

  try {
    // Prepare update payload
    const update: OrderStatusUpdate = {
      status: newStatus,
    };

    // Add cancellation reason if cancelling
    if (newStatus === 'cancelled') {
      update.cancellationReason = 'Cancelled by vendor';
    }

    // Call API to update status
    const updatedOrder = await orderService.updateOrderStatus(order.id, update);
    
    // Update local state
    setOrder(updatedOrder);

    // TODO: Send notification if enabled (see Stage 8.3)
    if (notificationsEnabled) {
      // Notification will be handled in Stage 8.3
      console.log('Notification would be sent here');
    }

    // Show success feedback (toast notification - see Stage 8.6)
    // toast.success('Order status updated successfully');
    
  } catch (err: any) {
    const errorMessage = err?.message || 'Failed to update order status';
    setError(errorMessage);
    console.error('Error updating order status:', err);
    
    // Show error feedback
    // toast.error(errorMessage);
  } finally {
    setIsLoading(false);
  }
};
```

**Step 5: Handle Data Transformation**

The backend may return `items` as a JSON string. The existing `parseOrderItems` utility handles this, but ensure it's used correctly:

```typescript
// In the render section, items are already parsed:
const items = parseOrderItems(order.items);
```

**Notes**:
- All API calls are wrapped in try-catch for error handling
- Loading states prevent duplicate requests
- Error messages are user-friendly
- Status transitions are validated before API call
- Confirmation dialogs for critical actions

---

### 8.3 Integrate WhatsApp Notifications

**File**: `frontend_v2/apps/web-vendor/src/services/whatsappNotifications.ts`

- Replace mock implementation with real API calls
- Handle notification sending after status updates
- Provide fallback if notification fails (don't block status update)

**Step 1: Update WhatsApp Notification Service**

Replace the mock implementation with:
```typescript
import { apiClient } from '../lib/api';
import type { Order } from '../components/conversations/types';

export interface WhatsAppNotificationService {
  sendOrderStatusUpdate(
    orderId: string,
    status: string,
    orderData: Order
  ): Promise<{ success: boolean; messageId?: string; error?: string }>;

  sendOrderTemplateMessage(
    customerPhone: string,
    templateName: string,
    parameters: Record<string, string>
  ): Promise<{ success: boolean; messageId?: string; error?: string }>;
}

// Real implementation
export const whatsappNotifications: WhatsAppNotificationService = {
  /**
   * Send order status update notification via WhatsApp
   * This can be called automatically after status update or via separate endpoint
   */
  async sendOrderStatusUpdate(orderId: string, status: string, orderData: Order) {
    try {
      // Option A: If backend handles notification automatically with status update
      // This method may not be needed if backend sends notification automatically
      
      // Option B: Separate notification endpoint (if implemented)
      const response = await apiClient.post<{ success: boolean; messageId?: string }>(
        `/orders/${orderId}/notify`,
        {
          status,
          orderNumber: orderData.orderNumber,
          customerPhone: orderData.customer?.phone,
        }
      );

      return {
        success: response.success,
        messageId: response.messageId,
      };
    } catch (error: any) {
      // Don't throw - return error info so caller can handle gracefully
      return {
        success: false,
        error: error?.message || 'Failed to send notification',
      };
    }
  },

  /**
   * Send generic WhatsApp template message
   */
  async sendOrderTemplateMessage(
    customerPhone: string,
    templateName: string,
    parameters: Record<string, string>
  ) {
    try {
      const response = await apiClient.post<{ success: boolean; messageId?: string }>(
        '/notifications/send-template',
        {
          customerPhone,
          templateName,
          parameters,
        }
      );

      return {
        success: response.success,
        messageId: response.messageId,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || 'Failed to send template message',
      };
    }
  },
};
```

**Step 2: Integrate Notification in OrderDetails**

Update `handleStatusUpdate` in `OrderDetails.tsx` to send notification:

```typescript
const handleStatusUpdate = async (newStatus: string) => {
  // ... existing validation and confirmation logic ...

  try {
    const updatedOrder = await orderService.updateOrderStatus(order.id, update);
    setOrder(updatedOrder);

    // Send notification if enabled
    if (notificationsEnabled) {
      try {
        const notifyResult = await whatsappNotifications.sendOrderStatusUpdate(
          order.id,
          newStatus,
          updatedOrder
        );

        if (!notifyResult.success) {
          // Log warning but don't fail the status update
          console.warn('Status updated but notification failed:', notifyResult.error);
          // Optionally show a warning toast
          // toast.warning('Status updated but notification failed to send');
        } else {
          // toast.success('Status updated and notification sent');
        }
      } catch (notifyError) {
        // Notification failure should not block status update
        console.error('Notification error:', notifyError);
        // toast.warning('Status updated but notification failed');
      }
    } else {
      // toast.success('Order status updated successfully');
    }
  } catch (err: any) {
    // ... error handling ...
  }
};
```

**Notes**:
- Notification failures don't block status updates
- User gets feedback about notification status
- Backend may handle notifications automatically (check backend implementation)
- If backend sends notifications automatically, frontend service may only be needed for explicit sends (e.g., payment links)

---

### 8.4 Integrate Payment Links (When Backend Ready)

**File**: `frontend_v2/apps/web-vendor/src/services/paymentLinks.ts`

- Replace mock implementation with real API calls
- Handle payment link generation, status checking, and sending

**Step 1: Update Payment Link Service**

Replace mock implementation with:
```typescript
import { apiClient } from '../lib/api';
import { whatsappNotifications } from './whatsappNotifications';

export interface PaymentLinkResponse {
  paymentLink: string;
  paymentLinkId: string;
  expiresAt?: string;
}

export interface PaymentLinkStatus {
  status: 'pending' | 'paid' | 'expired' | 'failed';
  paidAt?: string;
  amount?: number;
}

export interface PaymentLinkService {
  generatePaymentLink(
    orderId: string,
    amount: number,
    customerPhone: string
  ): Promise<{ success: boolean; paymentLink?: string; error?: string }>;

  sendPaymentLink(
    orderId: string,
    paymentLink: string,
    customerPhone: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }>;

  getPaymentLinkStatus(
    paymentLinkId: string
  ): Promise<{ status: 'pending' | 'paid' | 'expired' | 'failed'; paidAt?: string }>;
}

export const paymentLinkService: PaymentLinkService = {
  /**
   * Generate payment link for an order
   */
  async generatePaymentLink(orderId: string, amount: number, customerPhone: string) {
    try {
      const response = await apiClient.post<PaymentLinkResponse>(
        `/orders/${orderId}/payment-link`,
        {
          amount,
          customerPhone,
        }
      );

      return {
        success: true,
        paymentLink: response.paymentLink,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || 'Failed to generate payment link',
      };
    }
  },

  /**
   * Send payment link via WhatsApp
   */
  async sendPaymentLink(orderId: string, paymentLink: string, customerPhone: string) {
    try {
      // Use WhatsApp notification service to send payment link
      const result = await whatsappNotifications.sendOrderTemplateMessage(
        customerPhone,
        'payment_link',
        {
          paymentLink,
          orderNumber: orderId, // Or get from order data
        }
      );

      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || 'Failed to send payment link',
      };
    }
  },

  /**
   * Get payment link status
   */
  async getPaymentLinkStatus(paymentLinkId: string) {
    try {
      const response = await apiClient.get<PaymentLinkStatus>(
        `/payment-links/${paymentLinkId}/status`
      );
      return response;
    } catch (error: any) {
      throw new Error(error?.message || 'Failed to get payment link status');
    }
  },
};
```

**Step 2: Update PaymentLinkModal Component**

**File**: `frontend_v2/apps/web-vendor/src/components/orders/modals/PaymentLinkModal.tsx`

- Replace mock payment link generation with real API call
- Handle loading and error states
- Show payment link status

**Step 3: Update OrderDetails Page**

Update `handleGeneratePaymentLink` function:
```typescript
const handleGeneratePaymentLink = async () => {
  if (!order || !order.customer?.phone) {
    setError('Order or customer information missing');
    return;
  }

  setIsLoading(true);
  setError(null);

  try {
    const result = await paymentLinkService.generatePaymentLink(
      order.id,
      order.totalAmount,
      order.customer.phone
    );

    if (result.success && result.paymentLink) {
      setPaymentLink(result.paymentLink);
      paymentLinkModal.open();
      // toast.success('Payment link generated successfully');
    } else {
      setError(result.error || 'Failed to generate payment link');
      // toast.error(result.error || 'Failed to generate payment link');
    }
  } catch (err: any) {
    const errorMessage = err?.message || 'Failed to generate payment link';
    setError(errorMessage);
    // toast.error(errorMessage);
  } finally {
    setIsLoading(false);
  }
};
```

Update `handleSendPaymentLink` function:
```typescript
const handleSendPaymentLink = async () => {
  if (!paymentLink || !order?.customer?.phone) {
    return;
  }

  setIsLoading(true);
  try {
    const result = await paymentLinkService.sendPaymentLink(
      order.id,
      paymentLink,
      order.customer.phone
    );

    if (result.success) {
      // toast.success('Payment link sent via WhatsApp');
      paymentLinkModal.close();
    } else {
      setError(result.error || 'Failed to send payment link');
      // toast.error(result.error || 'Failed to send payment link');
    }
  } catch (err: any) {
    const errorMessage = err?.message || 'Failed to send payment link';
    setError(errorMessage);
    // toast.error(errorMessage);
  } finally {
    setIsLoading(false);
  }
};
```

**Notes**:
- Payment link generation requires backend implementation first
- Status checking can be polled periodically if needed
- Payment webhooks will update order status automatically (backend handles)

---

### 8.5 Integrate Shipping (When Backend Ready)

**File**: `frontend_v2/apps/web-vendor/src/services/shipping.ts`

- Replace mock implementation with real API calls
- Handle shipment creation, rate fetching, label generation, and tracking

**Step 1: Update Shipping Service**

Replace mock implementation with:
```typescript
import { apiClient } from '../lib/api';

export interface ShippingData {
  deliveryAddress: string;
  customerPhone: string;
  customerName?: string;
  weight?: number;
  dimensions?: { length: number; width: number; height: number };
  shippingPartner?: 'shiprocket' | 'delhivery' | 'self';
}

export interface ShippingRate {
  partner: string;
  service: string;
  cost: number;
  estimatedDays: number;
}

export interface ShipmentResponse {
  shipmentId: string;
  trackingNumber: string;
  shippingPartner: string;
}

export interface ShippingUpdate {
  status: string;
  location?: string;
  timestamp: string;
  description: string;
}

export interface ShippingService {
  createShipment(
    orderId: string,
    shippingData: ShippingData
  ): Promise<{ success: boolean; shipmentId?: string; trackingNumber?: string; error?: string }>;

  getShippingRates(
    orderId: string,
    deliveryAddress: string
  ): Promise<{ success: boolean; rates?: ShippingRate[]; error?: string }>;

  generateShippingLabel(
    shipmentId: string
  ): Promise<{ success: boolean; labelUrl?: string; error?: string }>;

  trackShipment(
    trackingNumber: string
  ): Promise<{ success: boolean; status?: string; updates?: ShippingUpdate[]; error?: string }>;
}

export const shippingService: ShippingService = {
  /**
   * Create shipment for an order
   */
  async createShipment(orderId: string, shippingData: ShippingData) {
    try {
      const response = await apiClient.post<ShipmentResponse>(
        `/orders/${orderId}/shipment`,
        shippingData
      );

      return {
        success: true,
        shipmentId: response.shipmentId,
        trackingNumber: response.trackingNumber,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || 'Failed to create shipment',
      };
    }
  },

  /**
   * Get shipping rates for an order
   */
  async getShippingRates(orderId: string, deliveryAddress: string) {
    try {
      const response = await apiClient.get<ShippingRate[]>(
        `/orders/${orderId}/shipping-rates`,
        {
          // Note: apiClient.get may need query params handling
          // If not supported, construct URL manually
        }
      );

      // If query params not supported in apiClient.get, use:
      // const queryParams = new URLSearchParams({ address: deliveryAddress });
      // const response = await apiClient.get<ShippingRate[]>(
      //   `/orders/${orderId}/shipping-rates?${queryParams.toString()}`
      // );

      return {
        success: true,
        rates: Array.isArray(response) ? response : [],
      };
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || 'Failed to get shipping rates',
      };
    }
  },

  /**
   * Generate shipping label
   */
  async generateShippingLabel(shipmentId: string) {
    try {
      const response = await apiClient.get<{ labelUrl: string }>(
        `/shipments/${shipmentId}/label`
      );

      return {
        success: true,
        labelUrl: response.labelUrl,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || 'Failed to generate shipping label',
      };
    }
  },

  /**
   * Track shipment
   */
  async trackShipment(trackingNumber: string) {
    try {
      const response = await apiClient.get<ShippingUpdate[]>(
        `/shipments/${trackingNumber}/track`
      );

      return {
        success: true,
        updates: Array.isArray(response) ? response : [],
      };
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || 'Failed to track shipment',
      };
    }
  },
};
```

**Step 2: Update ShippingModal Component**

**File**: `frontend_v2/apps/web-vendor/src/components/orders/modals/ShippingModal.tsx`

- Replace mock shipment creation with real API call
- Integrate shipping rates fetching
- Handle label generation and tracking

**Step 3: Update OrderDetails Page**

Update `handleCreateShipment` function (in ShippingModal or OrderDetails):
```typescript
const handleCreateShipment = async (shippingData: ShippingData) => {
  if (!orderId) return;

  setIsLoading(true);
  setError(null);

  try {
    const result = await shippingService.createShipment(orderId, shippingData);

    if (result.success && result.trackingNumber) {
      setTrackingNumber(result.trackingNumber);
      setShippingStatus('created');
      setShippingPartner(shippingData.shippingPartner || 'self');
      // toast.success('Shipment created successfully');
      shippingModal.close();
    } else {
      setError(result.error || 'Failed to create shipment');
      // toast.error(result.error || 'Failed to create shipment');
    }
  } catch (err: any) {
    const errorMessage = err?.message || 'Failed to create shipment';
    setError(errorMessage);
    // toast.error(errorMessage);
  } finally {
    setIsLoading(false);
  }
};
```

**Notes**:
- Shipping integration requires backend implementation first
- Shipping rates should be fetched before creating shipment
- Label generation opens in new window/tab
- Tracking can be polled periodically for updates

---

### 8.6 Error Handling & User Feedback

**File**: `frontend_v2/apps/web-vendor/src/pages/OrderDetails.tsx`

- Implement comprehensive error handling
- Add user feedback via toast notifications
- Handle different error types appropriately

**Step 1: Install Toast Library (if not already installed)**

```bash
npm install react-hot-toast
# or
yarn add react-hot-toast
```

**Step 2: Setup Toast Provider**

**File**: `frontend_v2/apps/web-vendor/src/App.tsx` (or root component)

```typescript
import { Toaster } from 'react-hot-toast';

// In App component:
<Toaster
  position="top-right"
  toastOptions={{
    duration: 4000,
    style: {
      background: '#363636',
      color: '#fff',
    },
    success: {
      duration: 3000,
      iconTheme: {
        primary: '#4ade80',
        secondary: '#fff',
      },
    },
    error: {
      duration: 5000,
      iconTheme: {
        primary: '#ef4444',
        secondary: '#fff',
      },
    },
  }}
/>
```

**Step 3: Add Toast Notifications in OrderDetails**

```typescript
import toast from 'react-hot-toast';

// In handleStatusUpdate:
try {
  const updatedOrder = await orderService.updateOrderStatus(order.id, update);
  setOrder(updatedOrder);

  if (notificationsEnabled) {
    const notifyResult = await whatsappNotifications.sendOrderStatusUpdate(
      order.id,
      newStatus,
      updatedOrder
    );

    if (notifyResult.success) {
      toast.success('Order status updated and notification sent');
    } else {
      toast.success('Order status updated');
      toast.error('Failed to send notification', { duration: 3000 });
    }
  } else {
    toast.success('Order status updated successfully');
  }
} catch (err: any) {
  const errorMessage = err?.message || 'Failed to update order status';
  setError(errorMessage);
  toast.error(errorMessage);
}
```

**Step 4: Error Type Handling**

Create error handling utility:

**File**: `frontend_v2/apps/web-vendor/src/utils/errorHandling.ts`

```typescript
export interface ApiError {
  message: string;
  status?: number;
  code?: string;
}

/**
 * Transform API errors to user-friendly messages
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message;

    // Network errors
    if (message.includes('fetch') || message.includes('network')) {
      return 'Network error. Please check your internet connection and try again.';
    }

    // HTTP status codes
    if (message.includes('401') || message.includes('Unauthorized')) {
      return 'Your session has expired. Please log in again.';
    }

    if (message.includes('403') || message.includes('Forbidden')) {
      return 'You do not have permission to perform this action.';
    }

    if (message.includes('404') || message.includes('not found')) {
      return 'The requested resource was not found.';
    }

    if (message.includes('500') || message.includes('Internal Server Error')) {
      return 'Server error. Please try again later.';
    }

    // Return original message if no specific handling
    return message;
  }

  return 'An unexpected error occurred. Please try again.';
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('500') ||
      message.includes('502') ||
      message.includes('503')
    );
  }
  return false;
}
```

**Step 5: Use Error Handling in Components**

```typescript
import { getErrorMessage } from '../utils/errorHandling';

// In catch blocks:
catch (err: any) {
  const errorMessage = getErrorMessage(err);
  setError(errorMessage);
  toast.error(errorMessage);
}
```

**Notes**:
- Toast notifications provide immediate user feedback
- Error messages are user-friendly, not technical
- Network errors suggest retry
- 401 errors trigger automatic logout (handled by API client)

---

### 8.7 Data Transformation & Type Safety

**File**: `frontend_v2/apps/web-vendor/src/utils/orderParsing.ts` (already exists)

- Ensure order items parsing handles all backend formats
- Add type guards for order data validation
- Handle missing or malformed data gracefully

**Step 1: Enhance Order Parsing Utility**

Add validation and type guards:
```typescript
import type { OrderItem, Order } from '../components/conversations/types';

/**
 * Type guard to check if value is OrderItem array
 */
function isOrderItemArray(value: unknown): value is OrderItem[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        'product' in item &&
        'quantity' in item &&
        'unitPrice' in item &&
        'totalPrice' in item
    )
  );
}

/**
 * Parse order items from JSON string or object
 * Handles both string and object formats
 */
export function parseOrderItems(items: unknown): OrderItem[] {
  // If already an array, validate and return
  if (isOrderItemArray(items)) {
    return items;
  }

  // If string, try to parse JSON
  if (typeof items === 'string') {
    try {
      const parsed = JSON.parse(items);
      if (isOrderItemArray(parsed)) {
        return parsed;
      }
      // If parsed but not array, wrap in array
      if (parsed && typeof parsed === 'object') {
        return [parsed as OrderItem];
      }
      return [];
    } catch (error) {
      console.error('Failed to parse order items JSON:', error);
      return [];
    }
  }

  // If object but not array, wrap in array
  if (items && typeof items === 'object' && !Array.isArray(items)) {
    return [items as OrderItem];
  }

  // Default: empty array
  return [];
}

/**
 * Validate order data structure
 */
export function validateOrderData(order: unknown): order is Order {
  if (!order || typeof order !== 'object') {
    return false;
  }

  const o = order as Partial<Order>;
  return (
    typeof o.id === 'string' &&
    typeof o.orderNumber === 'string' &&
    typeof o.status === 'string' &&
    typeof o.totalAmount === 'number' &&
    typeof o.createdAt === 'string'
  );
}

/**
 * Normalize order data from API response
 */
export function normalizeOrderData(data: unknown): Order | null {
  if (!validateOrderData(data)) {
    console.error('Invalid order data structure:', data);
    return null;
  }

  // Ensure items are parsed
  const normalized: Order = {
    ...data,
    items: parseOrderItems(data.items),
  };

  return normalized;
}
```

**Step 2: Use Normalization in OrderDetails**

```typescript
useEffect(() => {
  const loadOrderDetails = async () => {
    // ... loading logic ...

    try {
      const orderData = await orderService.getOrderDetails(orderId);
      
      // Normalize and validate order data
      const normalized = normalizeOrderData(orderData);
      
      if (!normalized) {
        setError('Invalid order data received from server');
        return;
      }

      setOrder(normalized);
    } catch (err: any) {
      // ... error handling ...
    }
  };

  loadOrderDetails();
}, [orderId]);
```

**Notes**:
- Type guards ensure runtime type safety
- Normalization handles different backend response formats
- Invalid data is caught early with helpful error messages

---

### 8.8 Testing & Validation

**Testing Checklist**

1. **Order Details Loading**:
   - [ ] Load valid order ID - should display order details
   - [ ] Load invalid order ID - should show "Order not found"
   - [ ] Load order with no access - should show permission error
   - [ ] Test with network offline - should show network error
   - [ ] Test with slow network - should show loading state

2. **Status Updates**:
   - [ ] Test all valid status transitions
   - [ ] Test invalid status transition - should show error
   - [ ] Test cancellation confirmation - should require confirmation
   - [ ] Test delivery confirmation - should require confirmation
   - [ ] Test status update with notification enabled
   - [ ] Test status update with notification disabled

3. **Error Handling**:
   - [ ] Test 404 error handling
   - [ ] Test 403 error handling
   - [ ] Test 500 error handling
   - [ ] Test network timeout
   - [ ] Test malformed response data

4. **Data Transformation**:
   - [ ] Test order with items as JSON string
   - [ ] Test order with items as array
   - [ ] Test order with missing optional fields
   - [ ] Test order with malformed items data

5. **Payment Links** (when backend ready):
   - [ ] Test payment link generation
   - [ ] Test payment link sending
   - [ ] Test payment status checking

6. **Shipping** (when backend ready):
   - [ ] Test shipment creation
   - [ ] Test shipping rates fetching
   - [ ] Test label generation
   - [ ] Test shipment tracking

**Manual Testing Steps**

1. Open Order Details page with valid order ID
2. Verify all order information displays correctly
3. Update order status through valid transitions
4. Verify toast notifications appear
5. Test error scenarios (invalid ID, network issues)
6. Test with different order statuses
7. Verify notification toggle works
8. Test payment link flow (when available)
9. Test shipping flow (when available)

**Notes**:
- Test in development environment first
- Test with real backend endpoints
- Verify error messages are user-friendly
- Check loading states are appropriate
- Ensure toast notifications don't overlap

---

## Component Dependencies & Decisions

### Components to Create

1. **Modal Component** (Stage 0)
   - Location: `frontend_v2/packages/ui/src/Modal.tsx`
   - Features: ESC key, click outside, focus trap, ARIA labels, animations
   - Export from UI package index

2. **Toast/Notification Component**
   - Location: `frontend_v2/packages/ui/src/Toast.tsx` (to be created)
   - Alternative: Use `react-hot-toast` library (recommended for MVP)
   - Features: Success, error, warning, info variants
   - Auto-dismiss with configurable duration

3. **Dialog/Confirmation Component**
   - Location: `frontend_v2/packages/ui/src/Dialog.tsx` (to be created)
   - Alternative: Use Modal component with confirmation layout
   - Features: Title, message, confirm/cancel buttons
   - For critical actions (cancel order, mark delivered)

4. **Dropdown/Menu Component**
   - Location: `frontend_v2/packages/ui/src/Dropdown.tsx` (to be created)
   - Alternative: Use Headless UI Menu component (recommended)
   - Features: Three-dot menu, action items, keyboard navigation
   - For quick actions in order list

5. **Breadcrumb Component**
   - Location: `frontend_v2/packages/ui/src/Breadcrumb.tsx` (to be created)
   - Alternative: Simple back button with text
   - Features: Clickable path segments, current page indicator

6. **Date Range Picker**
   - Decision: Use preset buttons (Today, This Week, This Month) for MVP
   - Future: Add custom date range picker using `react-datepicker` library
   - Location: `frontend_v2/apps/web-vendor/src/components/orders/DateRangeFilter.tsx`

### Third-Party Libraries (Recommended)

- **react-hot-toast**: For toast notifications (lightweight, easy to use)
- **@headlessui/react**: For accessible dropdown menus and dialogs
- **date-fns**: For date formatting and manipulation (if needed)
- **debounce**: Already available in `@chatlogix/utils`

### Utility Functions Available

From `@chatlogix/utils`:
- `formatCurrency(amount, currency)`: Formats currency (INR by default)
- `formatPhone(phone)`: Formats phone numbers
- `formatDate(date, format)`: Formats dates
- `debounce(func, delay)`: Debounce function for search

From `frontend_v2/apps/web-vendor/src/lib/format.ts`:
- `formatPhone(phone)`: Advanced phone formatting with libphonenumber-js
- `formatMessageTime(timestamp)`: Message timestamp formatting

---

## Configuration & Constants

### Status Color Mapping

```typescript
// Status badge colors
export const statusColors: Record<string, BadgeVariant> = {
  pending: 'warning',      // Yellow
  confirmed: 'info',       // Blue
  preparing: 'warning',    // Orange/Yellow
  ready: 'info',           // Blue
  out_for_delivery: 'info', // Blue
  delivered: 'success',    // Green
  cancelled: 'default'     // Gray
};

// Status labels for display
export const statusLabels: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled'
};
```

### Status Transition Rules

```typescript
// Valid status transitions
export const validStatusTransitions: Record<string, string[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered'],
  delivered: [], // Terminal state
  cancelled: [] // Terminal state
};

// Check if status transition is valid
export function isValidStatusTransition(from: string, to: string): boolean {
  return validStatusTransitions[from]?.includes(to) ?? false;
}
```

### Default Values & Constants

```typescript
// Pagination
export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// Search debounce
export const SEARCH_DEBOUNCE_MS = 300;

// Date presets
export const DATE_PRESETS = {
  TODAY: 'today',
  THIS_WEEK: 'this_week',
  THIS_MONTH: 'this_month',
  CUSTOM: 'custom'
};

// Sort options
export const SORT_OPTIONS = {
  NEWEST_FIRST: 'newest',
  OLDEST_FIRST: 'oldest',
  AMOUNT_HIGH_TO_LOW: 'amount_desc',
  AMOUNT_LOW_TO_HIGH: 'amount_asc'
};

// Currency formatting
// Note: Order amounts are stored in paise (smallest currency unit)
// Divide by 100 before formatting: formatCurrency(order.totalAmount / 100, 'INR')
export const CURRENCY_CODE = 'INR';
export const CURRENCY_SYMBOL = '₹';
```

### View Preferences

```typescript
// Default view for order list
export const DEFAULT_ORDER_VIEW = 'table'; // 'table' | 'card'

// Persist view preference in localStorage
export const ORDER_VIEW_STORAGE_KEY = 'orderListViewPreference';
```

---

## Data Parsing Utilities

### Order Items Parsing

```typescript
// File: frontend_v2/apps/web-vendor/src/utils/orderParsing.ts

import type { OrderItem } from '../components/conversations/types';

/**
 * Parse order items from JSON string or object
 * Handles both string and object formats
 */
export function parseOrderItems(items: unknown): OrderItem[] {
  // If already an array, return as-is
  if (Array.isArray(items)) {
    return items;
  }
  
  // If string, try to parse JSON
  if (typeof items === 'string') {
    try {
      const parsed = JSON.parse(items);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Failed to parse order items:', error);
      return [];
    }
  }
  
  // If object but not array, wrap in array
  if (items && typeof items === 'object') {
    return [items as OrderItem];
  }
  
  // Default: empty array
  return [];
}

/**
 * Get item count from order items
 */
export function getItemCount(items: unknown): number {
  const parsed = parseOrderItems(items);
  return parsed.reduce((sum, item) => sum + (item.quantity || 0), 0);
}

/**
 * Get items summary (first N items)
 */
export function getItemsSummary(items: unknown, maxItems: number = 3): string {
  const parsed = parseOrderItems(items);
  if (parsed.length === 0) return 'No items';
  
  const itemNames = parsed.slice(0, maxItems).map(item => item.product);
  const summary = itemNames.join(', ');
  
  if (parsed.length > maxItems) {
    return `${summary} and ${parsed.length - maxItems} more`;
  }
  
  return summary;
}
```

### Currency Formatting

```typescript
// File: frontend_v2/apps/web-vendor/src/utils/currency.ts

import { formatCurrency } from '@chatlogix/utils';

/**
 * Format order amount (stored in paise) to currency string
 */
export function formatOrderAmount(amountInPaise: number): string {
  return formatCurrency(amountInPaise / 100, 'INR');
}

/**
 * Format amount with currency symbol
 */
export function formatAmountWithSymbol(amountInPaise: number): string {
  const rupees = amountInPaise / 100;
  return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
```

### Date Formatting

```typescript
// File: frontend_v2/apps/web-vendor/src/utils/dateFormatting.ts

import { formatDate } from '@chatlogix/utils';

/**
 * Format order date for display
 */
export function formatOrderDate(date: string | Date): string {
  return formatDate(date, 'short');
}

/**
 * Format date with time
 */
export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Get relative time (e.g., "2 hours ago")
 */
export function getRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  
  return formatOrderDate(d);
}
```

---

## Mobile Responsiveness

### Breakpoints

```typescript
// Tailwind CSS breakpoints (default)
const breakpoints = {
  sm: '640px',   // Small devices
  md: '768px',   // Medium devices (tablets)
  lg: '1024px',  // Large devices (desktops)
  xl: '1280px'   // Extra large devices
};
```

### Mobile-Specific Behaviors

1. **Order List Page**:
   - Desktop: Table view (default)
   - Mobile (< 768px): Card view (default, no toggle needed)
   - Filters: Stack vertically on mobile
   - Stats cards: 2 columns on mobile, 4 columns on desktop
   - Search bar: Full width on mobile
   - Action buttons: Icon-only on mobile, text + icon on desktop

2. **Order Details Page**:
   - Sections: Stack vertically on mobile
   - Action buttons: Full width on mobile, inline on desktop
   - Timeline: Vertical layout on mobile, horizontal on desktop
   - Modals: Full screen on mobile (< 640px), centered on desktop

3. **Modals**:
   - Mobile: Full screen or near-full screen
   - Desktop: Centered with max-width
   - Close button: Always visible, top-right corner
   - Scrollable content: Max height with overflow-y-auto

4. **Navigation**:
   - Breadcrumbs: Truncate on mobile, show full path on desktop
   - Back button: Always visible on mobile

---

## Empty States & Error Handling

### Empty States

1. **Order List - No Orders**:
   ```tsx
   <div className="text-center py-12">
     <EmptyIcon className="mx-auto h-12 w-12 text-gray-400" />
     <h3 className="mt-2 text-sm font-medium text-gray-900">No orders found</h3>
     <p className="mt-1 text-sm text-gray-500">
       {hasFilters 
         ? 'Try adjusting your filters to see more results.'
         : 'Get started by creating your first order.'}
     </p>
     {hasFilters && (
       <button onClick={onClearFilters} className="mt-4">
         Clear Filters
       </button>
     )}
   </div>
   ```

2. **Order List - No Results After Filtering**:
   - Show message: "No orders match your current filters"
   - Provide "Clear Filters" button
   - Suggest alternative filters

3. **Order Details - Missing Data**:
   - Show placeholder text for missing fields
   - Use "Not available" or "N/A" for optional fields
   - Don't show sections that have no data

### Error States

1. **API Error Handling**:
   ```typescript
   interface ErrorState {
     hasError: boolean;
     errorMessage: string;
     retry?: () => void;
   }
   ```

2. **Error Display Components**:
   - Network errors: "Unable to connect. Please check your internet connection."
   - 404 errors: "Order not found. It may have been deleted."
   - 500 errors: "Something went wrong. Please try again later."
   - All errors should have a retry button

3. **Error Boundaries**:
   - Wrap main components in Error Boundaries
   - Log errors to error tracking service
   - Show user-friendly error message
   - Provide option to reload page

### Loading States

1. **Skeleton Loaders**:
   - Use skeleton loaders for initial page load
   - Match the structure of actual content
   - Show shimmer animation

2. **Loading Indicators**:
   - Spinner for button actions
   - Progress bar for long operations
   - Inline loading state for status updates

3. **Loading States by Component**:
   - **Order List**: Skeleton table/cards
   - **Order Details**: Skeleton sections
   - **Modals**: Spinner overlay
   - **Actions**: Button loading state

---

## Accessibility Considerations

### Keyboard Navigation

1. **Modal Navigation**:
   - Tab key cycles through focusable elements
   - Shift+Tab cycles backwards
   - ESC closes modal
   - Enter/Space activates buttons

2. **Table Navigation**:
   - Arrow keys navigate between cells (future enhancement)
   - Enter/Space activates row actions
   - Tab navigates between rows

3. **Focus Management**:
   - Focus trap in modals
   - Return focus to trigger element after modal closes
   - Visible focus indicators

### Screen Reader Support

1. **ARIA Labels**:
   - All buttons have descriptive labels
   - Status badges have aria-label
   - Form inputs have associated labels
   - Tables have proper headers

2. **Semantic HTML**:
   - Use proper heading hierarchy (h1, h2, h3)
   - Use semantic elements (nav, main, section, article)
   - Use button elements for actions, not divs

3. **Live Regions**:
   - Announce status updates
   - Announce filter changes
   - Announce error messages

### Color Contrast

1. **Status Badges**:
   - Ensure WCAG AA contrast ratio (4.5:1 for text)
   - Use icons in addition to color
   - Provide text labels

2. **Interactive Elements**:
   - Clear hover states
   - Clear focus states
   - Disabled state clearly indicated

---

## Performance Optimization

### Code Splitting

1. **Route-based Splitting**:
   - Lazy load Order Details page
   - Lazy load Order List page
   - Lazy load modals

2. **Component Splitting**:
   - Split large components into smaller chunks
   - Lazy load heavy components (charts, tables)

### Data Fetching

1. **Debouncing**:
   - Search input: 300ms debounce
   - Filter changes: 500ms debounce

2. **Caching**:
   - Cache order list data
   - Cache order details
   - Invalidate cache on updates

3. **Pagination**:
   - Implement virtual scrolling for large lists (future)
   - Load more on scroll (future)
   - Current: Page-based pagination

### Rendering Optimization

1. **Memoization**:
   - Memoize expensive calculations
   - Memoize filtered/sorted lists
   - Use React.memo for list items

2. **Virtualization**:
   - Use react-window for long lists (future)
   - Render only visible items

---

## Testing Considerations

### Unit Tests

1. **Utility Functions**:
   - `parseOrderItems`: Test JSON string, array, object inputs
   - `formatOrderAmount`: Test paise to currency conversion
   - `getRelativeTime`: Test various time differences
   - `isValidStatusTransition`: Test all valid/invalid transitions

2. **Component Tests**:
   - Modal open/close behavior
   - Filter application logic
   - Status update handlers
   - Navigation functions

### Integration Tests

1. **User Flows**:
   - Navigate from conversations to order details
   - Update order status
   - Generate payment link
   - Create shipment

2. **API Integration** (when implemented):
   - Mock API responses
   - Test error handling
   - Test loading states

### E2E Tests (Future)

1. **Critical Paths**:
   - Complete order flow
   - Status update with notification
   - Payment link generation and sending

---

## Implementation Checklist

### Stage 0: Foundation
- [ ] Create Modal component
- [ ] Create useModal hook
- [ ] Export Modal from UI package
- [ ] Test modal accessibility

### Stage 1: Quick Details Popup
- [ ] Create OrderQuickDetailsModal component
- [ ] Update CustomerDetailsPanel to use modal
- [ ] Add route for Order Details page
- [ ] Create navigation utilities
- [ ] Test navigation flow

### Stage 1.5: Order List
- [ ] Create Orders page component
- [ ] Create OrderListItem component
- [ ] Create OrderStatsCards component
- [ ] Create OrderFilters component
- [ ] Add /orders route
- [ ] Implement filter persistence
- [ ] Test table/card view toggle
- [ ] Test filtering and search

### Stage 2: Order Details
- [ ] Create OrderDetails page component
- [ ] Create CustomerConversationModal component
- [ ] Integrate conversation modal
- [ ] Update Conversations page for pre-selection
- [ ] Implement order timeline
- [ ] Test all sections display correctly

### Stage 3: Product Mapping
- [ ] Update Order types
- [ ] Add product mapping placeholders
- [ ] Add "Coming Soon" indicators

### Stage 4: Notifications
- [ ] Create WhatsApp notification service (mock)
- [ ] Create template configuration
- [ ] Add notification settings UI
- [ ] Integrate notification trigger
- [ ] Test notification flow (mock)

### Stage 5: Payment Links
- [ ] Create payment link service (mock)
- [ ] Create PaymentLinkModal component
- [ ] Add payment link UI in Order Details
- [ ] Integrate payment link generation
- [ ] Test payment link flow (mock)

### Stage 6: Shipping
- [ ] Create shipping service (mock)
- [ ] Create ShippingModal component
- [ ] Add shipping UI in Order Details
- [ ] Integrate shipment creation
- [ ] Test shipping flow (mock)

### Stage 7: Backend Placeholders
- [ ] Create WhatsAppTemplateService placeholder
- [ ] Create PaymentLinkService placeholder
- [ ] Create ShippingService placeholder
- [ ] Add TODO comments in order routes
- [ ] Create payment routes placeholder
- [ ] Create shipping routes placeholder

### Stage 8: Frontend API Integration
- [ ] Create orderService.ts with API methods
- [ ] Replace mock data in OrderDetails.tsx with API calls
- [ ] Update loadOrderDetails function with real API
- [ ] Update handleStatusUpdate function with real API
- [ ] Add error handling and user feedback (toast notifications)
- [ ] Test order details loading with real API
- [ ] Test status updates (all transitions)
- [ ] Update WhatsApp notification service with real API calls
- [ ] Integrate notification sending in status updates
- [ ] Test notification flow
- [ ] Update payment link service (when backend ready)
- [ ] Integrate payment link generation in OrderDetails
- [ ] Test payment link flow (when backend ready)
- [ ] Update shipping service (when backend ready)
- [ ] Integrate shipment creation in OrderDetails
- [ ] Test shipping flow (when backend ready)
- [ ] Add data transformation utilities
- [ ] Add type guards and validation
- [ ] Test error scenarios (404, 403, 500, network errors)
- [ ] Test data transformation with different formats
- [ ] Verify toast notifications work correctly
- [ ] Code review and refactoring

### Polish & Refinement
- [ ] Add empty states
- [ ] Add error handling
- [ ] Add loading states
- [ ] Test accessibility
- [ ] Test mobile responsiveness
- [ ] Add unit tests for utilities
- [ ] Code review and refactoring

---

## Notes & Reminders

### Hardcoded Data Markers

All hardcoded data should be clearly marked with comments:
```typescript
// HARDCODED DATA - Replace with API call
// MOCK DATA - Will be replaced with real API call
// TODO: Replace with actual API integration
```

### Future Enhancements

1. **Real-time Updates**:
   - WebSocket integration for live order updates
   - Polling fallback option

2. **Advanced Features**:
   - Bulk actions (bulk status update)
   - Export orders to CSV/Excel
   - Order analytics dashboard
   - Custom status workflows

3. **Integration Enhancements**:
   - Multiple payment gateways
   - Multiple shipping partners
   - Email notifications
   - SMS notifications

4. **UI/UX Improvements**:
   - Drag-and-drop status updates
   - Keyboard shortcuts
   - Dark mode support
   - Customizable dashboard

### API Integration Points

**Note**: See Stage 8 for detailed frontend API integration implementation.

When ready to integrate with real APIs:

1. **Order Service** (Stage 8.1, 8.2):
   - `GET /api/orders` - List orders
   - `GET /api/orders/:id` - Get order details ✅ Available
   - `PUT /api/orders/:id/status` - Update status ✅ Available
   - `POST /api/orders/:id/confirm` - Confirm order ✅ Available
   - `POST /api/orders/:id/cancel` - Cancel order ✅ Available

2. **Notification Service** (Stage 8.3):
   - `POST /api/orders/:id/notify` - Send notification ⏳ (Optional - backend may handle automatically)
   - `GET /api/notifications/templates` - Get templates ⏳

3. **Payment Service** (Stage 8.4):
   - `POST /api/orders/:id/payment-link` - Generate link ⏳ Backend placeholder
   - `GET /api/payment-links/:id/status` - Get status ⏳ Backend placeholder

4. **Shipping Service** (Stage 8.5):
   - `POST /api/orders/:id/shipment` - Create shipment ⏳ Backend placeholder
   - `GET /api/orders/:id/shipping-rates` - Get shipping rates ⏳ Backend placeholder
   - `GET /api/shipments/:id/label` - Generate label ⏳ Backend placeholder
   - `GET /api/shipments/:trackingNumber/track` - Track shipment ⏳ Backend placeholder

**Status Legend**:
- ✅ Available - Backend endpoint implemented and ready
- ⏳ Pending - Backend endpoint not yet implemented (placeholder exists)

---

## Conclusion

This plan provides a comprehensive roadmap for implementing order management features with a UI-first approach. All stages are designed to work with hardcoded data initially, with clear markers for API integration points. The implementation should proceed stage by stage, with each stage building upon the previous one.

**Key Principles**:
- UI-first development
- Clear separation of concerns
- Accessibility from the start
- Mobile-responsive design
- Error handling and empty states
- Performance considerations
- Clear API integration points

**Next Steps**:
1. Review and approve this plan
2. Set up project structure
3. Begin Stage 0 implementation
4. Iterate through stages sequentially
5. **Stage 8**: Integrate APIs when backend is ready (see Stage 8 for detailed implementation)

**Current Status**:
- Stages 0-2: UI implementation (completed)
- Stage 7: Backend API placeholders (completed)
- **Stage 8: Frontend API Integration** (ready to implement - see detailed plan above)