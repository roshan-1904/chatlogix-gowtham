# 💰 Vendor Pricing Calculation Requirements - ChatLogix

> ⚠️ **Not the shipped pricing system (checked 2026-09-16).** Every formula below — plan credits, remaining credits, usage %, extra-usage rate — depends on a monthly plan quota that **does not exist in the code**. `PLAN_CREDITS` / `getPlanCredits` were deleted and no API returns `planCredits`, `remainingThisMonth` or `usagePercentage`.
>
> Shipped model: one prepaid wallet, `Vendor.walletBalanceMilli` in **millirupees**, debited per billable action as `ceil((aiCost + whatsappCost + platformFee) × (1 + Vendor.markupPercent/100))` by `backend/src/services/pricing/pricingService.ts`. The low-balance warning fires under **₹20**, not the thresholds below. Authority: **[docs/BILLING_AND_PRICING.md](../../../docs/BILLING_AND_PRICING.md)**.
>
> Keep this document as the **commercial requirements** input for the future rate card (P2h); do not implement from it as-is.

## 📋 Document Overview
This document defines the complete requirements for implementing the vendor pricing calculation system in ChatLogix, including subscription plans, credit management, usage tracking, and billing calculations.

---

## 🎯 Business Objectives

### **Primary Goals:**
- Implement transparent, predictable pricing for vendors
- Ensure accurate credit tracking and billing
- Provide flexible scaling options for growing businesses
- Maintain healthy profit margins across all plans
- Eliminate credit risk through prepaid model

### **Success Metrics:**
- 99.9% billing accuracy
- <5 second pricing calculations
- Zero billing disputes
- 95% vendor satisfaction with pricing transparency

---

## 📊 Pricing Plan Structure

### **Plan Tiers & Pricing:**

| Plan Name | Monthly Price (₹) | Included Credits | Extra Rate (₹/conversation) | Target Users |
|-----------|-------------------|------------------|------------------------------|--------------|
| **Starter** | 99 | 100 | 1.00 | Home-based sellers, small shops |
| **Pro** | 499 | 500 | 0.75 | Growing businesses, online sellers |
| **Business** | 1,499 | 2,000 | 0.60 | Established businesses, multi-location |
| **Enterprise** | 4,999 | 10,000 | 0.50 | Large businesses, franchises |

### **Credit System Rules:**
- **1 Credit = 1 Conversation** (incoming or outgoing)
- **Credits are consumed** when conversation is processed
- **Unused credits expire** at the end of billing cycle
- **Extra conversations** are charged at plan-specific rates

---

## 🔢 Pricing Calculation Requirements

### **1. Basic Subscription Calculation**

#### **Formula:**
```
Monthly Revenue = Base Plan Price + Extra Usage Charges
```

#### **Components:**
- **Base Revenue**: Fixed monthly subscription fee
- **Extra Usage Revenue**: (Total Conversations - Plan Credits) × Extra Rate
- **Total Revenue**: Base + Extra

### **2. Credit Consumption Tracking**

#### **Real-time Credit Balance:**
```
Remaining Credits = Plan Credits - Used Credits
```

#### **Usage Percentage:**
```
Usage % = (Used Credits / Plan Credits) × 100
```

#### **Extra Usage Calculation:**
```
Extra Conversations = Total Conversations - Plan Credits
Extra Charges = Extra Conversations × Extra Rate
```

### **3. Wallet Balance Management**

#### **Wallet Operations:**
```
New Balance = Current Balance + Recharge Amount - Deductions
```

#### **Low Balance Alerts:**
- **Warning**: Balance < ₹100
- **Critical**: Balance < ₹50
- **Service Pause**: Balance < Renewal Fee

---

## 💳 Billing & Payment Requirements

### **1. Subscription Renewal**

#### **Renewal Rules:**
- **Auto-renewal**: Enabled by default
- **Renewal Date**: Same date each month
- **Payment Method**: UPI, Cards, Net Banking
- **Failure Handling**: 3 retry attempts, then service pause

#### **Renewal Process:**
```
1. Check wallet balance 3 days before renewal
2. If sufficient: Auto-deduct renewal fee
3. If insufficient: Send payment reminder
4. On renewal day: Process payment or pause service
```

### **2. Extra Usage Billing**

#### **Billing Frequency:**
- **Real-time**: Deduct from wallet as conversations occur
- **Daily Summary**: Send usage summary to vendor
- **Monthly Invoice**: Detailed breakdown of all charges

#### **Billing Triggers:**
```
When (Total Conversations > Plan Credits):
  - Calculate extra conversations
  - Apply plan-specific rate
  - Deduct from wallet balance
  - Send real-time notification
```

---

## 📈 Revenue Calculation Requirements

### **1. Per-Vendor Revenue Calculation**

#### **Monthly Revenue Formula:**
```
Vendor Revenue = Plan Price + Extra Usage Revenue
Extra Usage Revenue = Max(0, Total Conversations - Plan Credits) × Extra Rate
```

#### **Example Calculations:**

**Starter Plan Vendor (150 conversations):**
- Base Revenue: ₹99
- Extra Conversations: 150 - 100 = 50
- Extra Revenue: 50 × ₹1.00 = ₹50
- **Total Revenue: ₹149**

**Pro Plan Vendor (600 conversations):**
- Base Revenue: ₹499
- Extra Conversations: 600 - 500 = 100
- Extra Revenue: 100 × ₹0.75 = ₹75
- **Total Revenue: ₹574**

### **2. Aggregate Revenue Calculations**

#### **Total Monthly Revenue:**
```
Total Revenue = Σ(Vendor Revenue for all active vendors)
```

#### **Revenue by Plan:**
```
Plan Revenue = Σ(Vendor Revenue for plan tier)
```

#### **Average Revenue Per User (ARPU):**
```
ARPU = Total Revenue / Total Active Vendors
```

---

## 🎛️ Plan Management Requirements

### **1. Plan Upgrades/Downgrades**

#### **Upgrade Rules:**
```
New Credits = New Plan Credits
Remaining Credits = Min(Old Remaining Credits, New Plan Credits)
Prorated Refund = (Old Plan Price - New Plan Price) × (Days Remaining / 30)
```

#### **Downgrade Rules:**
```
New Credits = New Plan Credits
If (Remaining Credits > New Plan Credits):
  - Excess Credits = Remaining Credits - New Plan Credits
  - Refund = Excess Credits × (Old Extra Rate)
```

### **2. Plan Switching Timing**

#### **Immediate Effect:**
- **Credits**: Updated instantly
- **Rates**: Applied immediately
- **Billing**: Prorated for current month

#### **Billing Cycle:**
- **Current Month**: Prorated billing
- **Next Month**: Full new plan price

---

## 📊 Analytics & Reporting Requirements

### **1. Revenue Analytics Dashboard**

#### **Key Metrics:**
- **Monthly Recurring Revenue (MRR)**
- **Annual Recurring Revenue (ARR)**
- **Revenue by Plan Distribution**
- **Extra Usage Revenue Percentage**
- **Churn Rate by Plan**

#### **Revenue Growth Tracking:**
```
MRR Growth = (Current MRR - Previous MRR) / Previous MRR × 100
```

### **2. Usage Analytics**

#### **Vendor Usage Patterns:**
- **Average Conversations per Vendor**
- **Peak Usage Times**
- **Plan Utilization Rates**
- **Extra Usage Trends**

#### **Credit Efficiency:**
```
Credit Utilization = (Used Credits / Plan Credits) × 100
Extra Usage Rate = (Extra Conversations / Total Conversations) × 100
```

---

## 🔧 Technical Implementation Requirements

### **1. Database Schema**

#### **Core Tables:**
```sql
-- Vendor Plans
vendors (
  id, business_name, phone, email, 
  current_plan, plan_start_date, plan_end_date,
  wallet_balance, auto_renewal_enabled
)

-- Credit Tracking
credit_usage (
  id, vendor_id, conversation_id, 
  credits_consumed, usage_date, conversation_type
)

-- Billing History
billing_history (
  id, vendor_id, billing_date, plan_price, 
  extra_usage_charges, total_amount, payment_status
)

-- Wallet Transactions
wallet_transactions (
  id, vendor_id, transaction_type, amount, 
  balance_before, balance_after, transaction_date
)
```

### **2. API Endpoints**

#### **Pricing & Billing APIs:**
```
GET /api/vendors/{id}/pricing-summary
GET /api/vendors/{id}/usage-analytics
POST /api/vendors/{id}/upgrade-plan
POST /api/vendors/{id}/recharge-wallet
GET /api/admin/revenue-analytics
```

### **3. Real-time Calculations**

#### **Performance Requirements:**
- **Pricing Calculations**: <100ms response time
- **Credit Updates**: Real-time (within 1 second)
- **Billing Processing**: <5 seconds for complex calculations
- **Concurrent Users**: Support 10,000+ simultaneous calculations

---

## 🚨 Business Rules & Constraints

### **1. Credit Management Rules**

#### **Credit Expiry:**
- **Monthly Reset**: Credits reset on renewal date
- **No Carry Forward**: Unused credits don't roll over
- **Partial Month**: Prorated credits for new subscriptions

#### **Credit Validation:**
```
If (Remaining Credits <= 0):
  - Pause new conversations
  - Send low balance alert
  - Offer wallet recharge
```

### **2. Billing Rules**

#### **Payment Processing:**
- **Prepaid Model**: Service requires sufficient wallet balance
- **Auto-pause**: Service stops when wallet is insufficient
- **Resume**: Service resumes immediately after recharge

#### **Refund Policy:**
- **Plan Downgrades**: Prorated refunds
- **Service Issues**: Credit-based compensation
- **Cancellation**: No refunds for unused credits

---

## 📋 Testing Requirements

### **1. Unit Testing**

#### **Calculation Accuracy:**
- **Credit Consumption**: Verify 1:1 conversation-to-credit ratio
- **Extra Usage**: Validate rate calculations across all plans
- **Plan Switching**: Test prorated billing accuracy
- **Wallet Operations**: Verify balance calculations

### **2. Integration Testing**

#### **End-to-End Scenarios:**
- **New Vendor Onboarding**: Complete billing cycle
- **Plan Upgrade**: Mid-cycle plan change
- **Extra Usage**: Billing beyond plan limits
- **Wallet Recharge**: Service resumption

### **3. Performance Testing**

#### **Load Testing:**
- **Concurrent Calculations**: 10,000+ simultaneous pricing calculations
- **Database Performance**: Sub-second query response times
- **API Response**: <100ms for pricing endpoints

---

## 📊 Success Metrics & KPIs

### **1. Financial Metrics**

#### **Revenue KPIs:**
- **MRR Growth**: Target 15% month-over-month
- **ARPU**: Target ₹800+ per vendor
- **Extra Usage Revenue**: Target 20% of total revenue
- **Churn Rate**: Target <5% monthly

### **2. Operational Metrics**

#### **System Performance:**
- **Billing Accuracy**: 99.9% error-free calculations
- **Response Time**: <100ms for pricing calculations
- **Uptime**: 99.9% system availability
- **Customer Support**: <2 hour response time for billing issues

---

## 🔄 Future Enhancements

### **1. Advanced Pricing Models**

#### **Usage-Based Tiers:**
- **Pay-per-conversation**: No monthly commitment
- **Volume Discounts**: Reduced rates for high-volume users
- **Seasonal Pricing**: Peak/off-peak rate adjustments

#### **Custom Plans:**
- **Hybrid Models**: Mix of fixed + variable pricing
- **Industry-Specific**: Tailored plans for different business types
- **Geographic Pricing**: Location-based rate adjustments

### **2. Revenue Optimization**

#### **Dynamic Pricing:**
- **Demand-Based**: Adjust rates based on usage patterns
- **Competitive Pricing**: Market-based rate optimization
- **Bundle Offers**: Combined service packages

---

## 📝 Implementation Checklist

### **Phase 1: Core Pricing Engine**
- [ ] Database schema design and implementation
- [ ] Basic pricing calculation logic
- [ ] Credit tracking system
- [ ] Wallet management

### **Phase 2: Billing & Payment**
- [ ] Subscription renewal system
- [ ] Payment processing integration
- [ ] Invoice generation
- [ ] Refund handling

### **Phase 3: Analytics & Reporting**
- [ ] Revenue dashboard
- [ ] Usage analytics
- [ ] Performance monitoring
- [ ] Business intelligence reports

### **Phase 4: Advanced Features**
- [ ] Plan switching logic
- [ ] Prorated billing
- [ ] Advanced analytics
- [ ] Optimization tools

---

## 📞 Support & Maintenance

### **1. Technical Support**

#### **Escalation Matrix:**
- **Level 1**: Basic pricing questions, usage clarifications
- **Level 2**: Complex billing issues, plan modifications
- **Level 3**: System bugs, calculation errors

#### **Response Times:**
- **Critical Issues**: <1 hour (billing errors, service outages)
- **High Priority**: <4 hours (plan changes, wallet issues)
- **Normal Priority**: <24 hours (general inquiries, clarifications)

### **2. Documentation**

#### **Required Documentation:**
- **API Reference**: Complete endpoint documentation
- **Business Rules**: Detailed pricing logic explanation
- **Troubleshooting Guide**: Common issues and solutions
- **Training Materials**: Vendor and admin user guides

---

*This document serves as the comprehensive guide for implementing the vendor pricing calculation system in ChatLogix. All requirements should be reviewed and approved by stakeholders before development begins.*
