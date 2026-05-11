# Vendor Settings - Open Questions & Decisions

> **📚 Related Documentation**: [Documentation Index](./INDEX.md) | [API Documentation](./API_DOCUMENTATION.md) | [Implementation Plan](./IMPLEMENTATION_PLAN.md)

## Overview

This document lists all open questions and decisions that need to be made before starting implementation. Each question includes context, options, recommendations, and impact analysis.

## 🔴 Critical Questions (Must Decide Before Implementation)

### 1. Phone Number & Email Verification

**Question**: Should phone number and email changes require verification?

**Context**:
- Phone numbers are used for authentication (OTP-based login)
- Email is used for account notifications and password recovery
- Currently, phone verification exists for login but not for updates
- Changing phone/email could lock vendors out or compromise security

**Options**:

**Option A: No Verification (Simplest)**
- Allow immediate changes
- Show warning message
- Risk: Security concern if account is compromised

**Option B: Email Verification Only**
- Require email verification for email changes
- No verification for phone (since phone is used for login)
- Send verification email, require code confirmation
- Risk: Medium security concern

**Option C: Both Require Verification**
- Require OTP verification for phone changes
- Require email verification for email changes
- More secure but more complex UX
- Risk: Low security concern, but higher friction

**Recommendation**: **Option B** - Email verification only
- Phone is already verified during login
- Email changes need verification to prevent account takeover
- Balance between security and UX

**Impact**:
- **High**: Affects business-info API implementation
- Requires email verification service integration
- Adds 1-2 days to implementation

---

### 2. Authorization Model

**Question**: Should vendors be able to update ALL settings, or should some remain admin-only?

**Context**:
- Currently `PUT /api/vendors/:id/ai-prompts` requires admin role
- Some settings might be too sensitive for vendors to change
- Need to balance vendor autonomy vs. platform control

**Options**:

**Option A: Full Vendor Access**
- Vendors can update all their settings
- Admin can still override if needed
- Maximum vendor autonomy

**Option B: Restricted Access**
- Vendors can update most settings
- Admin-only: Subscription plan, wallet balance, critical AI settings
- Balance between autonomy and control

**Option C: Tiered Access**
- Basic plan: Limited settings access
- Pro/Business plan: Full settings access
- Based on subscription tier

**Recommendation**: **Option A** - Full vendor access
- Vendors should own their configuration
- Admin can still access via admin panel
- Simpler implementation

**Impact**:
- **Medium**: Affects authorization checks
- Need to update `PUT /api/vendors/:id/ai-prompts` authorization
- No additional complexity

---

### 3. Auto-Save Draft Functionality

**Question**: Should we implement auto-save draft functionality?

**Context**:
- Long forms (especially AI Configuration tab)
- Risk of data loss if browser closes
- Improves UX but adds complexity

**Options**:

**Option A: No Auto-Save (MVP)**
- Simple save button
- Risk of data loss
- Faster implementation

**Option B: Auto-Save to localStorage**
- Save form state to localStorage
- Restore on page reload
- No server calls
- Simple implementation

**Option C: Auto-Save to Server**
- Periodically save drafts to server
- Restore from server
- More complex, requires draft storage

**Recommendation**: **Option B** - Auto-save to localStorage
- Good balance of UX and complexity
- No server changes needed
- Can add server-side drafts later

**Impact**:
- **Low**: Frontend-only feature
- Adds 1 day to implementation
- Nice-to-have, not critical

---

### 4. Settings Change History

**Question**: Should we track settings change history?

**Context**:
- Useful for debugging issues
- Helps vendors see what changed
- Allows rollback if needed
- Adds database complexity

**Options**:

**Option A: No History (MVP)**
- No tracking
- Simpler implementation
- Cannot rollback changes

**Option B: Basic History**
- Track last modified timestamp
- Track who modified (vendor/admin)
- No detailed change log

**Option C: Full Audit Log**
- Track all changes with before/after values
- Track timestamp, user, IP address
- Allows rollback
- More complex

**Recommendation**: **Option A** - No history for MVP
- Can add later if needed
- Focus on core functionality first
- Database already has `updatedAt` field

**Impact**:
- **Low**: Can be added later
- Saves 2-3 days of implementation
- Not critical for MVP

---

### 5. Rate Limiting for Settings Updates

**Question**: Should we add rate limiting for settings update endpoints?

**Context**:
- Rate limiting exists for dashboard stats (60 req/min)
- Settings updates are less frequent but more critical
- Prevents abuse and accidental rapid changes

**Options**:

**Option A: No Rate Limiting**
- Allow unlimited updates
- Risk of accidental rapid changes
- Simpler implementation

**Option B: Moderate Rate Limiting**
- 10 updates per minute per vendor
- Prevents accidental rapid changes
- Still allows normal usage

**Option C: Strict Rate Limiting**
- 5 updates per minute per vendor
- Very conservative
- May frustrate users making multiple changes

**Recommendation**: **Option B** - Moderate rate limiting (10/min)
- Prevents abuse without being restrictive
- Can use existing rate limit infrastructure
- Low implementation effort

**Impact**:
- **Low**: Can reuse existing rate limit middleware
- Adds 1-2 hours to implementation
- Good security practice

---

## 🟡 Important Questions (Should Decide Soon)

### 6. Settings Templates

**Question**: Should we provide pre-configured settings templates for common business types?

**Context**:
- Different business types have different needs
- Templates could speed up onboarding
- Adds complexity to UI

**Options**:

**Option A: No Templates (MVP)**
- Start from scratch
- Simpler implementation
- More manual work for vendors

**Option B: Basic Templates**
- 3-5 common templates (Food, Retail, Service)
- One-click apply template
- Overwrites current settings

**Option C: Advanced Templates**
- Many templates
- Partial application (select which settings to apply)
- Template marketplace

**Recommendation**: **Option A** - No templates for MVP
- Can add later based on user feedback
- Focus on core functionality
- Saves 2-3 days

**Impact**:
- **Low**: Can be added later
- Not critical for MVP
- Nice-to-have feature

---

### 7. Mobile App Settings Page

**Question**: Should mobile app have the same settings page or simplified version?

**Context**:
- Mobile app exists (`vendor-mobile`)
- Settings page is currently placeholder
- Mobile has limited screen space

**Options**:

**Option A: Web Only (MVP)**
- Implement settings only in web app
- Mobile app redirects to web or shows "Use web app"
- Simplest approach

**Option B: Simplified Mobile Version**
- Key settings only (most important)
- Simplified UI
- Separate implementation

**Option C: Full Mobile Version**
- Same functionality as web
- Responsive mobile UI
- Most work, best UX

**Recommendation**: **Option A** - Web only for MVP
- Mobile can be added later
- Focus on web app first
- Mobile users can use web app

**Impact**:
- **Low**: Mobile can be added later
- Saves 3-5 days
- Not critical for MVP

---

### 8. Settings Import/Export

**Question**: Should vendors be able to import/export their settings?

**Context**:
- Useful for backup/restore
- Useful for migrating between accounts
- Useful for testing different configurations

**Options**:

**Option A: No Import/Export (MVP)**
- Manual configuration only
- Simpler implementation

**Option B: Export Only**
- Export settings as JSON
- Manual import via admin
- Simple implementation

**Option C: Full Import/Export**
- Export and import settings
- Validation on import
- More complex

**Recommendation**: **Option A** - No import/export for MVP
- Can add later if needed
- Not critical functionality
- Saves 2-3 days

**Impact**:
- **Low**: Can be added later
- Not critical for MVP

---

### 9. Confirmation Dialogs

**Question**: Which settings changes should require confirmation dialogs?

**Context**:
- Some changes have significant impact
- Confirmation prevents accidental changes
- Too many confirmations frustrate users

**Options**:

**Option A: No Confirmations**
- Direct updates
- Risk of accidental changes
- Fastest UX

**Option B: Critical Changes Only**
- Confirm: Phone/email changes, AI model changes, Order prefix changes
- No confirmation for other changes
- Balance of safety and UX

**Option C: All Changes**
- Confirm every change
- Very safe but frustrating
- Not recommended

**Recommendation**: **Option B** - Critical changes only
- Phone/email: Security impact
- AI model: Cost impact
- Order prefix: Affects order numbering
- Other changes: Low risk

**Impact**:
- **Low**: Frontend-only feature
- Adds 2-3 hours
- Good UX practice

---

### 10. Field-Level Validation Feedback

**Question**: How should we handle validation errors - inline or form-level?

**Context**:
- Some fields have complex validation
- Need clear error feedback
- Balance between helpful and overwhelming

**Options**:

**Option A: Inline Errors Only**
- Show errors below each field
- Real-time validation
- Clear and focused

**Option B: Form-Level Summary**
- Show error summary at top
- Less specific
- Can be overwhelming

**Option C: Both**
- Inline errors + summary
- Most helpful
- Can be redundant

**Recommendation**: **Option A** - Inline errors only
- Clear and focused
- Standard UX pattern
- Less overwhelming

**Impact**:
- **Low**: UI implementation detail
- Standard pattern
- No additional complexity

---

## 🟢 Nice-to-Have Questions (Can Decide Later)

### 11. Settings Search

**Question**: Should we add search functionality within settings?

**Recommendation**: No for MVP - Can add later if settings page grows

**Impact**: Low - Can be added later

---

### 12. Settings Comparison

**Question**: Should vendors be able to compare their settings with templates or other vendors?

**Recommendation**: No for MVP - Too complex, low priority

**Impact**: Low - Can be added later

---

### 13. Settings Analytics

**Question**: Should we track which settings are most commonly changed?

**Recommendation**: No for MVP - Can add analytics later

**Impact**: Low - Can be added later

---

### 14. Bulk Settings Update

**Question**: Should admins be able to bulk update settings for multiple vendors?

**Recommendation**: No for MVP - Admin feature, can add later

**Impact**: Low - Can be added later

---

## Decision Matrix

| Question | Priority | Recommendation | Impact if Delayed | Can Add Later? |
|----------|----------|---------------|-------------------|----------------|
| Phone/Email Verification | 🔴 Critical | Email only | High - Security risk | Yes |
| Authorization Model | 🔴 Critical | Full vendor access | Medium - Blocks implementation | No |
| Auto-Save Draft | 🟡 Important | localStorage | Low - UX improvement | Yes |
| Settings History | 🟡 Important | No for MVP | Low - Debugging | Yes |
| Rate Limiting | 🟡 Important | 10/min | Low - Security | Yes |
| Settings Templates | 🟢 Nice-to-Have | No for MVP | Low - UX improvement | Yes |
| Mobile Settings | 🟢 Nice-to-Have | Web only | Low - Mobile UX | Yes |
| Import/Export | 🟢 Nice-to-Have | No for MVP | Low - Convenience | Yes |
| Confirmation Dialogs | 🟡 Important | Critical only | Low - UX | Yes |
| Field Validation | 🟡 Important | Inline errors | Low - UX | No |

---

## Recommended Decisions Summary

### For MVP Implementation:

1. **Phone/Email Verification**: Both require verification (Option C) ✅ **APPROVED**
   - **Decision**: ✅ Approved
   - **Notes**: Both phone and email changes will require verification for maximum security. Phone changes require OTP verification, email changes require email verification.

2. **Authorization**: Full vendor access (Option A) ✅ **APPROVED**
   - **Decision**: ✅ Approved
   - **Notes**: Vendors can update all their settings. Admin can still override via admin panel if needed.

3. **Auto-Save**: localStorage auto-save (Option B) ✅ **APPROVED**
   - **Decision**: ✅ Approved
   - **Notes**: Implement localStorage auto-save to prevent data loss. Save form state locally, restore on page reload.

4. **Settings History**: No history for MVP (Option A) ✅ **APPROVED**
   - **Decision**: ✅ Approved
   - **Notes**: No change history tracking for MVP. Can add audit logging later if needed.

5. **Rate Limiting**: 10 updates/min (Option B) ✅ **APPROVED**
   - **Decision**: ✅ Approved
   - **Notes**: Implement moderate rate limiting (10 updates per minute per vendor) to prevent abuse and accidental rapid changes.

6. **Settings Templates**: Basic templates (Option B) ✅ **APPROVED**
   - **Decision**: ✅ Approved
   - **Notes**: Include 3-5 common templates (Food, Retail, Service, etc.) with one-click apply functionality. Templates overwrite current settings.

7. **Mobile Settings**: Full mobile version (Option C) ✅ **APPROVED**
   - **Decision**: ✅ Approved
   - **Notes**: Implement full settings page in mobile app with same functionality as web. Responsive mobile UI.

8. **Settings Import/Export**: No import/export for MVP (Option A) ✅ **APPROVED**
   - **Decision**: ✅ Approved
   - **Notes**: Defer import/export functionality to later. Focus on core settings management first.

9. **Confirmation Dialogs**: All changes (Option C) ✅ **APPROVED**
   - **Decision**: ✅ Approved
   - **Notes**: Require confirmation for all settings changes to prevent accidental modifications. Show confirmation dialog before saving.

10. **Field Validation**: Inline errors (Option A) ✅ **APPROVED**
   - **Decision**: ✅ Approved
   - **Notes**: Show validation errors inline below each field. Real-time validation with clear error messages. 

### Defer to Later:

- Settings import/export (approved for MVP deferral)
- Settings search
- Settings analytics
- Bulk settings update
- Settings history/audit log (approved for MVP deferral)

---

## Implementation Impact Summary

### Based on Approved Decisions:

**Backend Changes**:
- ✅ Phone & Email verification service integration (2-3 days)
  - OTP verification for phone changes
  - Email verification for email changes
- ✅ Rate limiting middleware (1-2 hours)
- ✅ Authorization updates (2-3 hours)
- **Total**: ~3-4 days

**Frontend Changes**:
- ✅ localStorage auto-save (1 day)
- ✅ Confirmation dialogs for all changes (1 day)
- ✅ Settings templates system (2-3 days)
- ✅ Mobile app settings page (3-5 days)
- ✅ Inline validation (standard pattern)
- **Total**: ~7-10 days

**Total Additional Time**: 10-14 days (on top of base implementation)

**Note**: Mobile app settings and templates add significant time. Consider phasing these features.

---

## Next Steps

1. **Review these questions** with team
2. **Make decisions** on critical questions (marked 🔴)
3. **Document decisions** in "Recommended Decisions Summary" section above
4. **Update implementation plan** based on decisions
5. **Start implementation** with clear direction

---

## Discussion Notes

Use this section to document team discussions and final decisions:

### Decision Log

**Date**: December 2024
**Attendees**: [Team]
**Decisions Made**:
- ✅ Phone/Email Verification: Both require verification (Option C)
- ✅ Authorization: Full vendor access (Option A)
- ✅ Auto-Save: localStorage auto-save (Option B)
- ✅ Settings History: No history for MVP (Option A)
- ✅ Rate Limiting: 10 updates/min (Option B)
- ✅ Settings Templates: Basic templates (Option B)
- ✅ Mobile Settings: Full mobile version (Option C)
- ✅ Import/Export: No import/export for MVP (Option A)
- ✅ Confirmation Dialogs: All changes (Option C)
- ✅ Field Validation: Inline errors (Option A)

**Rationale**: 
- Security-first approach: Both phone and email verification for maximum account security
- User experience: Full mobile support and templates for better onboarding
- Safety: Confirmation dialogs for all changes prevent accidental modifications
- MVP focus: Defer import/export and history tracking to keep MVP scope manageable

---

## Questions to Discuss

### Critical (Must Decide):
1. Phone/Email Verification - Email only or both?
2. Authorization Model - Full access or restricted?

### Important (Should Decide):
3. Auto-Save Draft - localStorage or no auto-save?
4. Rate Limiting - 10/min or different limit?
5. Confirmation Dialogs - Which changes need confirmation?

### Nice-to-Have (Can Decide Later):
6. Settings Templates - Include in MVP?
7. Mobile Settings - Include in MVP?
8. Import/Export - Include in MVP?

---

**Status**: ✅ Decisions Made - Ready for Implementation  
**Last Updated**: December 2024

---

## ⚠️ Implementation Considerations

Based on the approved decisions, note the following:

### High Impact Decisions:

1. **Phone & Email Verification (Option C)**
   - Requires OTP service integration for phone verification
   - Requires email verification service integration
   - Adds 2-3 days to backend implementation
   - Consider: Can we use existing Firebase OTP for phone verification?

2. **Mobile Settings (Option C)**
   - Full mobile implementation adds 3-5 days
   - Consider: Phase 1 - Web only, Phase 2 - Mobile

3. **Settings Templates (Option B)**
   - Template system adds 2-3 days
   - Consider: Can templates be added in Phase 2?

4. **Confirmation Dialogs (Option C)**
   - Confirmation for all changes may frustrate users
   - Consider: Start with critical changes only, add more if needed

### Recommended Phasing:

**Phase 1 (MVP)**:
- Phone/Email verification (both)
- Full vendor access
- localStorage auto-save
- Rate limiting
- Inline validation
- Confirmation dialogs (start with critical only, can expand)

**Phase 2 (Enhancements)**:
- Settings templates
- Mobile app settings page
- Import/Export functionality

**Phase 3 (Advanced)**:
- Settings history/audit log
- Settings analytics
- Bulk operations

