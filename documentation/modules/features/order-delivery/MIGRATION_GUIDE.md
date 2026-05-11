# Migration Guide: From aiPreparationTimeMinutes to Order Preparation Config

## Overview

This guide explains how to migrate from the legacy `aiPreparationTimeMinutes` field to the new `orderPreparationConfig` system.

## Background

**Legacy System**:
- Single field: `aiPreparationTimeMinutes` (integer)
- Limited to fixed minutes only
- No support for variable times or custom messages

**New System**:
- Flexible `orderPreparationConfig` (JSON)
- Supports multiple preparation types
- Custom messages for variable times
- Category-based delivery date settings

## Migration Process

### Automatic Migration

A migration script automatically converts existing `aiPreparationTimeMinutes` values to `orderPreparationConfig`.

**Migration Rules**:

1. **If `aiPreparationTimeMinutes === 0` or `null`**:
   ```json
   {
     "type": "after_order"
   }
   ```

2. **If `aiPreparationTimeMinutes > 0`**:
   ```json
   {
     "type": "fixed_minutes",
     "fixedMinutes": <aiPreparationTimeMinutes>
   }
   ```

**Example**:
```typescript
// Before
{
  "aiPreparationTimeMinutes": 30
}

// After (automatically migrated)
{
  "aiPreparationTimeMinutes": 30,  // Kept for backward compatibility
  "orderPreparationConfig": {
    "type": "fixed_minutes",
    "fixedMinutes": 30
  }
}
```

---

## Manual Migration Steps

### Step 1: Run Database Migration

```bash
cd backend
npm run prisma:migrate
```

This adds the new fields:
- `category`
- `askForPreferredDeliveryDate`
- `orderPreparationConfig`

### Step 2: Run Data Migration Script

```bash
cd backend
npm run ts-node scripts/migrate-preparation-time-config.ts
```

This converts existing `aiPreparationTimeMinutes` values to `orderPreparationConfig`.

### Step 3: Verify Migration

Check a few vendors to ensure migration worked:

```sql
SELECT 
  id,
  "businessName",
  "aiPreparationTimeMinutes",
  "orderPreparationConfig"
FROM "Vendor"
WHERE "aiPreparationTimeMinutes" IS NOT NULL
LIMIT 5;
```

Expected result:
- `orderPreparationConfig` should be populated
- `aiPreparationTimeMinutes` should still exist (for backward compatibility)

---

## Updating Vendor Settings

### For Food Vendors

**Before**:
```json
{
  "aiPreparationTimeMinutes": 30
}
```

**After** (Recommended):
```json
{
  "category": "food",
  "askForPreferredDeliveryDate": true,
  "orderPreparationConfig": {
    "type": "fixed_minutes",
    "fixedMinutes": 30
  }
}
```

**API Call**:
```bash
curl -X PUT \
  http://localhost:3000/api/vendors/{vendorId}/order-settings \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "category": "food",
    "askForPreferredDeliveryDate": true,
    "orderPreparationConfig": {
      "type": "fixed_minutes",
      "fixedMinutes": 30
    }
  }'
```

---

### For Retail Vendors

**Before**:
```json
{
  "aiPreparationTimeMinutes": 0
}
```

**After** (Recommended):
```json
{
  "category": "retail",
  "askForPreferredDeliveryDate": false,
  "orderPreparationConfig": {
    "type": "ready_to_ship"
  }
}
```

---

### For Variable Preparation Times

**Before**:
```json
{
  "aiPreparationTimeMinutes": 30
}
```

**After** (If preparation time varies):
```json
{
  "category": "food",
  "askForPreferredDeliveryDate": true,
  "orderPreparationConfig": {
    "type": "variable",
    "message": "Usually ready in 30-45 minutes depending on the items"
  }
}
```

---

## Backward Compatibility

The system maintains backward compatibility:

1. **`aiPreparationTimeMinutes` is still supported**:
   - Existing code using this field continues to work
   - Field is kept in database schema
   - Can be used as fallback if `orderPreparationConfig` is not set

2. **Gradual Migration**:
   - Vendors can migrate at their own pace
   - No breaking changes
   - Both systems work simultaneously

3. **API Compatibility**:
   - GET endpoints return both fields
   - PUT endpoints accept both (but prefer `orderPreparationConfig`)

---

## Migration Checklist

- [ ] Run database migration
- [ ] Run data migration script
- [ ] Verify migration for sample vendors
- [ ] Update vendor settings via API (optional)
- [ ] Test order flow with migrated vendors
- [ ] Update frontend to use new fields (if applicable)
- [ ] Document vendor-specific configurations

---

## Common Migration Scenarios

### Scenario 1: Food Vendor with Fixed Time

**Current**: `aiPreparationTimeMinutes: 30`

**Migrate to**:
```json
{
  "category": "food",
  "askForPreferredDeliveryDate": true,
  "orderPreparationConfig": {
    "type": "fixed_minutes",
    "fixedMinutes": 30
  }
}
```

---

### Scenario 2: Food Vendor Starting After Order

**Current**: `aiPreparationTimeMinutes: 0` or `null`

**Migrate to**:
```json
{
  "category": "food",
  "askForPreferredDeliveryDate": true,
  "orderPreparationConfig": {
    "type": "after_order"
  }
}
```

---

### Scenario 3: Retail Vendor

**Current**: `aiPreparationTimeMinutes: 0` or `null`

**Migrate to**:
```json
{
  "category": "retail",
  "askForPreferredDeliveryDate": false,
  "orderPreparationConfig": {
    "type": "ready_to_ship"
  }
}
```

---

## Troubleshooting

### Issue: Migration Script Fails

**Error**: "Vendor not found" or database errors

**Solution**:
1. Check database connection
2. Verify Prisma schema is updated
3. Ensure vendor IDs are correct

---

### Issue: orderPreparationConfig Not Populated

**Error**: `orderPreparationConfig` is `null` after migration

**Solution**:
1. Check if `aiPreparationTimeMinutes` exists for vendor
2. Re-run migration script
3. Manually set via API if needed

---

### Issue: Both Fields Have Different Values

**Error**: `aiPreparationTimeMinutes` and `orderPreparationConfig.fixedMinutes` don't match

**Solution**:
1. This is expected if vendor updated settings manually
2. Use `orderPreparationConfig` as source of truth
3. Update `aiPreparationTimeMinutes` to match (optional)

---

## Best Practices

1. **Migrate Gradually**: Test with a few vendors first
2. **Keep Legacy Field**: Don't remove `aiPreparationTimeMinutes` immediately
3. **Use New System**: Prefer `orderPreparationConfig` for new configurations
4. **Document Changes**: Note which vendors have been migrated
5. **Test Thoroughly**: Verify order flow works with new settings

---

## Future Deprecation

**Timeline**: `aiPreparationTimeMinutes` will be deprecated in a future version.

**Plan**:
1. Phase 1 (Current): Both systems supported
2. Phase 2 (Future): `orderPreparationConfig` preferred, `aiPreparationTimeMinutes` fallback
3. Phase 3 (Future): `aiPreparationTimeMinutes` removed

**Action Required**: Migrate all vendors to `orderPreparationConfig` before Phase 3.

---

## Related Documentation

- [Configuration Guide](./CONFIGURATION_GUIDE.md) - How to configure settings
- [API Documentation](./API_DOCUMENTATION.md) - API endpoints
- [Implementation Guide](./IMPLEMENTATION_GUIDE.md) - Implementation details

