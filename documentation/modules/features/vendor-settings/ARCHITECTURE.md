# Vendor Settings Page - Architecture Overview

> **📚 Related Documentation**: [Documentation Index](./INDEX.md) | [UI/UX Specifications](./UI_UX_SPECIFICATIONS.md) | [API Documentation](./API_DOCUMENTATION.md)

## Component Architecture

```
Settings Page (Main Container)
├── SettingsHeader
│   ├── Title
│   └── Description
├── SettingsTabs (Tab Navigation)
│   ├── AccountTab
│   ├── AIConfigTab
│   ├── OrderSettingsTab
│   ├── NotificationsTab
│   └── AdvancedTab
├── SettingsContent (Tab Content Area)
│   └── [Active Tab Content]
└── SettingsFooter
    ├── Save Button
    └── Cancel Button
```

## Data Flow

```
User Interaction
    ↓
Form State (React Hook Form)
    ↓
Validation (Zod Schema)
    ↓
API Call (via apiClient)
    ↓
Backend (Express + Prisma)
    ↓
Database (PostgreSQL)
    ↓
Response
    ↓
State Update (TanStack Query)
    ↓
UI Update
```

## State Management Strategy

### Form State
- **Library**: React Hook Form
- **Purpose**: Handle form inputs, validation, and submission
- **Scope**: Per-tab form state

### Server State
- **Library**: TanStack Query
- **Purpose**: Fetch and cache vendor settings from API
- **Features**: 
  - Automatic refetching
  - Optimistic updates
  - Error handling

### Local State
- **Purpose**: UI state (active tab, modals, etc.)
- **Implementation**: React useState/useReducer

### Persistence
- **Draft Saving**: localStorage (auto-save drafts)
- **Final Data**: PostgreSQL via API

## File Structure

> **Verified against the shipped code (Sep 2026)**: the tree below reflects what actually exists in `frontend_v2/apps/web-vendor/src/` today, which is a simpler, more consolidated layout than originally planned. Notably there's no separate `SettingsHeader`/`SettingsTabs`/`SettingsFooter`/per-field component layer — `Settings.tsx` renders the tab shell inline, and each tab component builds its own form directly with a handful of shared primitives. There are also no per-tab hooks (`useAIConfig`, `useOrderSettings`, etc.) — everything goes through one `useVendorSettings` hook.

```
frontend_v2/apps/web-vendor/src/
├── pages/
│   └── Settings.tsx                    # Main settings page (tab shell + navigation, inline)
├── components/
│   └── settings/
│       ├── ConfirmationDialog.tsx      # Confirmation modal (used by every tab)
│       ├── FormField.tsx               # Generic labeled input/textarea/number field
│       ├── HelpText.tsx                # Help text component
│       ├── Note.tsx                    # Info/warning note component
│       └── tabs/
│           ├── AccountBusinessTab.tsx  # Account & Business tab
│           ├── AIConfigTab.tsx         # AI Configuration tab
│           ├── OrderSettingsTab.tsx    # Order Settings tab
│           ├── NotificationsTab.tsx    # Notifications tab
│           └── AdvancedTab.tsx         # Advanced settings tab
├── hooks/
│   └── settings/
│       ├── useVendorSettings.ts        # Single hook: fetches + mutates all 5 tabs' data
│       └── useAutoSave.ts              # localStorage auto-save/restore helper
├── api/
│   └── settings.ts                     # API client functions for settings (incl. phone/email verification)
├── lib/
│   └── validation/
│       └── settingsSchemas.ts          # Zod validation schemas (mirrors backend/src/utils/validation/settingsSchemas.ts)
└── types/
    └── settings.ts                     # TypeScript types for settings
```

Several components this doc describes elsewhere (`AIModelSelector.tsx`, `OrderPrefixInput.tsx`, `PreparationTimeConfig.tsx`, `QuietHoursConfig.tsx`, `MatchingConfigForm.tsx`, per-tab hooks) were never built — the corresponding UI sections (AI model picker, order preparation-time config, quiet hours, per-status notification toggles, matching field-mapping/language dropdowns) don't exist in the shipped tabs even though the backend supports the underlying data. See the relevant `TAB_*.md` file for what's actually live in each tab.

## API Integration Pattern

### Hook Pattern
Each tab uses a custom hook that:
1. Fetches initial data using TanStack Query
2. Manages form state with React Hook Form
3. Handles submission with optimistic updates
4. Provides loading and error states

### Example Hook Structure
```typescript
export function useAIConfig(vendorId: string) {
  // Fetch data
  const { data, isLoading, error } = useQuery({
    queryKey: ['vendor', vendorId, 'ai-config'],
    queryFn: () => fetchAIConfig(vendorId),
  });

  // Form management
  const form = useForm({
    resolver: zodResolver(aiConfigSchema),
    defaultValues: data,
  });

  // Submit mutation
  const mutation = useMutation({
    mutationFn: updateAIConfig,
    onSuccess: () => {
      queryClient.invalidateQueries(['vendor', vendorId, 'ai-config']);
    },
  });

  return {
    form,
    isLoading,
    error,
    submit: form.handleSubmit(mutation.mutate),
  };
}
```

## Validation Strategy

### Client-Side Validation
- **Library**: Zod schemas
- **Timing**: On blur and submit
- **Feedback**: Inline error messages below fields

### Server-Side Validation
- **Backend**: Zod schemas in Express routes
- **Response**: Detailed error messages
- **Handling**: Display server errors in form

### Validation Rules
- Required fields clearly marked
- Format validation (email, phone, etc.)
- Business rules (e.g., order prefix length)
- Range validation (e.g., matching threshold 0-1)

## Error Handling

### Error Types
1. **Network Errors**: Retry with exponential backoff
2. **Validation Errors**: Display inline with fields
3. **Server Errors**: Show toast notification with details
4. **Unauthorized**: Redirect to login

### Error Display
- Inline errors: Below form fields
- Toast notifications: For submission errors
- Error boundaries: For unexpected errors

## Performance Optimizations

1. **Lazy Loading**: Load tab content on demand
2. **Debouncing**: Auto-save drafts with debounce
3. **Memoization**: Memoize expensive computations
4. **Code Splitting**: Split tab components into separate chunks
5. **Query Caching**: Cache API responses with TanStack Query

## Accessibility Considerations

1. **Keyboard Navigation**: Full keyboard support for all controls
2. **Screen Readers**: Proper ARIA labels and roles
3. **Focus Management**: Clear focus indicators
4. **Color Contrast**: Meet WCAG AA standards
5. **Form Labels**: All inputs have associated labels

## Security Considerations

1. **Authentication**: All API calls require valid JWT token
2. **Authorization**: Vendor can only edit their own settings
3. **Input Sanitization**: Sanitize all user inputs
4. **XSS Prevention**: React's built-in XSS protection
5. **CSRF Protection**: Token-based CSRF protection

## Testing Strategy

### Unit Tests
- Form validation logic
- Utility functions
- Component rendering

### Integration Tests
- Form submission flow
- API integration
- Error handling

### E2E Tests
- Complete settings update flow
- Tab navigation
- Save/cancel behavior

## Future Enhancements

1. **Settings Templates**: Pre-configured settings for common business types
2. **Settings Import/Export**: Backup and restore settings
3. **Settings History**: View and revert to previous settings
4. **Bulk Operations**: Update multiple settings at once
5. **Settings Analytics**: Track which settings are most used

